import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { createHash, webcrypto } from 'node:crypto';
import { DecryptWithKeyBodyInterface, DeriveKeyBodyInterface, EncryptWithKeyBodyInterface, PrepareSignupStorageBodyInterface, PrepareSignupStorageResultInterface, WrapMasterKeyBodyInterface } from './crypto.interface';

type AesGcmKey = import('node:crypto').webcrypto.CryptoKey;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 250_000;

@Injectable()
export class CryptoService {
  constructor(
    private readonly loggerService: Logger,
    private readonly configService: ConfigService
  ) {}

  async encryptEmailForLookup(email: string): Promise<string> {
    this.loggerService.log('encryptEmailForLookup {encryption}');
    const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
    const server_key = await this.deriveKey({ password: pepper, salt: encoder.encode('kitab:v1:server-secret') });
    const hash = createHash('sha256').update(email).digest();
    return this.encryptWithKey({
      plaintext: email,
      key: server_key,
      iv: new Uint8Array(hash.subarray(0, 12)),
    });
  }

  async decryptSecret(secret: string): Promise<string> {
    this.loggerService.log('decryptSecret {encryption}');
    const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
    const server_key = await this.deriveKey({ password: pepper, salt: encoder.encode('kitab:v1:server-secret') });
    return this.decryptWithKey({ ciphertext: secret, key: server_key });
  }

  async encryptSecret(secret: string): Promise<string> {
    this.loggerService.log('encryptSecret {encryption}');
    const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
    const server_key = await this.deriveKey({ password: pepper, salt: encoder.encode('kitab:v1:server-secret') });
    return this.encryptWithKey({
      plaintext: secret,
      key: server_key,
      iv: webcrypto.getRandomValues(new Uint8Array(12)),
    });
  }

  async prepareSignupStorage(body: PrepareSignupStorageBodyInterface): Promise<PrepareSignupStorageResultInterface> {
    this.loggerService.log('prepareSignupStorage {encryption}');
    const { password, recovery_key } = body;
    const { full_name, email, secret } = body.fields;
    const master_key = (await webcrypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )) as AesGcmKey;
    const raw_master_key = await webcrypto.subtle.exportKey('raw', master_key);
    const primary_wrap = await this.wrapMasterKey({ raw_master_key, password });
    const recovery_wrap = await this.wrapMasterKey({ raw_master_key, password: recovery_key });
    const { iv: key_iv, salt: key_salt, encrypted_master_key } = primary_wrap;
    const { iv: recovery_key_iv, salt: recovery_key_salt, encrypted_master_key: recovery_encrypted_master_key } = recovery_wrap;
    const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
    const server_key = await this.deriveKey({ password: pepper, salt: encoder.encode('kitab:v1:server-secret') });
    const hash = createHash('sha256').update(email).digest();
    const [encrypted_full_name, encrypted_email, encrypted_secret] = await Promise.all([
      this.encryptWithKey({ plaintext: full_name, key: master_key, iv: webcrypto.getRandomValues(new Uint8Array(12))}),
      this.encryptWithKey({ plaintext: email, key: server_key, iv: new Uint8Array(hash.subarray(0, 12))}),
      this.encryptWithKey({ plaintext: secret, key: server_key, iv: webcrypto.getRandomValues(new Uint8Array(12))})
    ]);
    return {
      key_iv,
      key_salt,
      recovery_key_iv,
      recovery_key_salt,
      encrypted_master_key,
      email: encrypted_email,
      secret: encrypted_secret,
      recovery_encrypted_master_key,
      full_name: encrypted_full_name
    };
  }

  private async wrapMasterKey(body: WrapMasterKeyBodyInterface) {
    this.loggerService.log('wrapMasterKey {encryption}');
    const { raw_master_key, password } = body;
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const salt = webcrypto.getRandomValues(new Uint8Array(12));
    const password_key = await this.deriveKey({ password, salt });
    const encrypted_master_key = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode('kitaab:v1:user-data') },
      password_key,
      raw_master_key
    );
    return {
      salt: Buffer.from(salt).toString('base64'),
      iv: Buffer.from(iv).toString('base64'),
      encrypted_master_key: Buffer.from(new Uint8Array(encrypted_master_key)).toString('base64'),
    };
  }

  private async deriveKey(body: DeriveKeyBodyInterface): Promise<AesGcmKey> {
    this.loggerService.log('deriveKey {encryption}');
    const { salt, password } = body;
    const password_key = await webcrypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return (await webcrypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      password_key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )) as AesGcmKey;
  }

  private async encryptWithKey(body: EncryptWithKeyBodyInterface): Promise<string> {
    this.loggerService.log('encryptWithKey {encryption}');
    const { iv, key, plaintext } = body;
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode('kitaab:v1:user-data') },
      key,
      encoder.encode(plaintext),
    );
    return `${Buffer.from(new Uint8Array(iv)).toString('base64')}.${Buffer.from(new Uint8Array(ciphertext)).toString('base64')}`;
  }

  private async decryptWithKey(body: DecryptWithKeyBodyInterface): Promise<string> {
    this.loggerService.log('decryptWithKey {encryption}');
    const { ciphertext, key } = body;
    const [iv_base64, data_base64] = ciphertext.split('.');
    const decrypted = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(iv_base64, 'base64'), additionalData: encoder.encode('kitaab:v1:user-data') },
      key,
      Buffer.from(data_base64, 'base64'),
    );
    return decoder.decode(decrypted);
  }
}