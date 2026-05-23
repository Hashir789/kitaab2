import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { VaultRecordInterface, CreateVaultBodyInterface, CreateVaultResultInterface, UnlockWithPasswordBodyInterface, UnlockWithRecoveryKeyBodyInterface, UnlockMasterKeyWithPasswordBodyInterface, UnlockMasterKeyWithRecoveryKeyBodyInterface, WrapMasterKeyWithPasswordBodyInterface, WrappedMasterKeyResultInterface, EncryptFieldBodyInterface, DecryptFieldBodyInterface, ChangePasswordBodyInterface, RotateRecoveryKeyBodyInterface, RotateRecoveryKeyResultInterface, SplitPackedBlobResultInterface } from './encryption.interface';

const SCRYPT_N = 2 ** 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const MASTER_KEY_LEN = 32;
const RECOVERY_KEY_LEN = 32;

@Injectable()
export class EncryptionService {

  constructor(
    private readonly loggerService: Logger,
    private readonly configService: ConfigService
  ) {}

  // helper functions

  hmacEmail(email: string): string {
    this.loggerService.log('hmacEmail {encryption}');
    const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
    const hmac_key = createHash('sha256')
      .update('email-blind-index:v1')
      .update(pepper)
      .digest();
    return createHmac('sha256', hmac_key)
      .update(email.trim().toLowerCase())
      .digest('base64');
  }

  createVault(body: CreateVaultBodyInterface): CreateVaultResultInterface {
    this.loggerService.log('createVault {encryption}');
    const { password, recovery_secret } = body;
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('Password is required.');
    }
    const provided_recovery = typeof recovery_secret === 'string' && recovery_secret.length > 0;
    const effective_recovery_secret = provided_recovery
      ? (recovery_secret as string)
      : randomBytes(RECOVERY_KEY_LEN).toString('base64');
    const master_key = randomBytes(MASTER_KEY_LEN);
    const password_salt = randomBytes(SALT_LEN);
    const recovery_salt = randomBytes(SALT_LEN);
    const password_kek = this.deriveKey(password, password_salt);
    const recovery_kek = this.deriveKey(effective_recovery_secret, recovery_salt);
    const wrapped_by_password = this.aesGcmEncrypt(password_kek, master_key);
    const wrapped_by_recovery = this.aesGcmEncrypt(recovery_kek, master_key);
    password_kek.fill(0);
    recovery_kek.fill(0);
    return {
      record: {
        kdf: { algorithm: 'scrypt', N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        password_salt: password_salt.toString('base64'),
        recovery_salt: recovery_salt.toString('base64'),
        wrapped_by_password,
        wrapped_by_recovery
      },
      master_key,
      recovery_key: provided_recovery ? null : effective_recovery_secret
    };
  }

  splitPackedBlob(packed: string): SplitPackedBlobResultInterface {
    this.loggerService.log('splitPackedBlob {encryption}');
    const buf = Buffer.from(packed, 'base64');
    if (buf.length < IV_LEN + TAG_LEN) {
      throw new Error('Packed blob too short.');
    }
    return {
      iv: buf.subarray(0, IV_LEN).toString('base64'),
      ciphertext: buf.subarray(IV_LEN).toString('base64')
    };
  }

  joinPackedBlob(iv: string, ciphertext: string): string {
    this.loggerService.log('joinPackedBlob {encryption}');
    return Buffer.concat([
      Buffer.from(iv, 'base64'),
      Buffer.from(ciphertext, 'base64'),
    ]).toString('base64');
  }

  unlockMasterKeyWithPassword(body: UnlockMasterKeyWithPasswordBodyInterface): Buffer {
    this.loggerService.log('unlockMasterKeyWithPassword {encryption}');
    const { password, key_salt, key_iv, encrypted_master_key } = body;
    return this.unlockWithPassword({
      password,
      record: {
        kdf: { algorithm: 'scrypt', N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        password_salt: key_salt,
        recovery_salt: '',
        wrapped_by_password: this.joinPackedBlob(key_iv, encrypted_master_key),
        wrapped_by_recovery: '',
      },
    });
  }

  unlockMasterKeyWithRecoveryKey(body: UnlockMasterKeyWithRecoveryKeyBodyInterface): Buffer {
    this.loggerService.log('unlockMasterKeyWithRecoveryKey {encryption}');
    const { recovery_key, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key } = body;
    return this.unlockWithRecoveryKey({
      recovery_key,
      record: {
        kdf: { algorithm: 'scrypt', N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        password_salt: '',
        recovery_salt: recovery_key_salt,
        wrapped_by_password: '',
        wrapped_by_recovery: this.joinPackedBlob(recovery_key_iv, recovery_encrypted_master_key)
      }
    });
  }

  wrapMasterKeyWithPassword(body: WrapMasterKeyWithPasswordBodyInterface): WrappedMasterKeyResultInterface {
    this.loggerService.log('wrapMasterKeyWithPassword {encryption}');
    const { master_key, password } = body;
    const salt = randomBytes(SALT_LEN);
    const kek = this.deriveKey(password, salt);
    try {
      const packed = this.aesGcmEncrypt(kek, master_key);
      const split = this.splitPackedBlob(packed);
      return {
        key_salt: salt.toString('base64'),
        key_iv: split.iv,
        encrypted_master_key: split.ciphertext,
      };
    } finally {
      kek.fill(0);
    }
  }

  unlockWithPassword(body: UnlockWithPasswordBodyInterface): Buffer {
    this.loggerService.log('unlockWithPassword {encryption}');
    const { record, password } = body;
    const kek = this.deriveKey(password, Buffer.from(record.password_salt, 'base64'));
    try {
      return this.aesGcmDecrypt(kek, record.wrapped_by_password);
    } catch {
      throw new Error('Invalid password.');
    } finally {
      kek.fill(0);
    }
  }

  unlockWithRecoveryKey(body: UnlockWithRecoveryKeyBodyInterface): Buffer {
    this.loggerService.log('unlockWithRecoveryKey {encryption}');
    const { record, recovery_key } = body;
    if (typeof recovery_key !== 'string' || recovery_key.length === 0) {
      throw new Error('Recovery key is required.');
    }
    const kek = this.deriveKey(recovery_key, Buffer.from(record.recovery_salt, 'base64'));
    try {
      return this.aesGcmDecrypt(kek, record.wrapped_by_recovery);
    } catch {
      throw new Error('Invalid recovery key.');
    } finally {
      kek.fill(0);
    }
  }

  encryptField(body: EncryptFieldBodyInterface): string {
    this.loggerService.log('encryptField {encryption}');
    const { master_key, plaintext } = body;
    return this.aesGcmEncrypt(master_key, Buffer.from(String(plaintext), 'utf8'));
  }

  decryptField(body: DecryptFieldBodyInterface): string {
    this.loggerService.log('decryptField {encryption}');
    const { master_key, ciphertext } = body;
    return this.aesGcmDecrypt(master_key, ciphertext).toString('utf8');
  }

  changePassword(body: ChangePasswordBodyInterface): VaultRecordInterface {
    this.loggerService.log('changePassword {encryption}');
    const { record, current_password, new_password } = body;
    if (typeof new_password !== 'string' || new_password.length === 0) {
      throw new Error('New password is required.');
    }
    const master_key = this.unlockWithPassword({ record, password: current_password });
    try {
      const new_salt = randomBytes(SALT_LEN);
      const new_kek = this.deriveKey(new_password, new_salt);
      const wrapped = this.aesGcmEncrypt(new_kek, master_key);
      new_kek.fill(0);
      return {
        ...record,
        password_salt: new_salt.toString('base64'),
        wrapped_by_password: wrapped,
      };
    } finally {
      master_key.fill(0);
    }
  }

  rotateRecoveryKey(body: RotateRecoveryKeyBodyInterface): RotateRecoveryKeyResultInterface {
    this.loggerService.log('rotateRecoveryKey {encryption}');
    const { record, password } = body;
    const master_key = this.unlockWithPassword({ record, password });
    try {
      const new_recovery_key = randomBytes(RECOVERY_KEY_LEN).toString('base64');
      const new_salt = randomBytes(SALT_LEN);
      const new_kek = this.deriveKey(new_recovery_key, new_salt);
      const wrapped = this.aesGcmEncrypt(new_kek, master_key);
      new_kek.fill(0);
      const updated: VaultRecordInterface = {
        ...record,
        recovery_salt: new_salt.toString('base64'),
        wrapped_by_recovery: wrapped,
      };
      return { record: updated, recovery_key: new_recovery_key };
    } finally {
      master_key.fill(0);
    }
  }

  constantTimeEqual(a: Buffer | string, b: Buffer | string): boolean {
    this.loggerService.log('constantTimeEqual {encryption}');
    const ba = Buffer.isBuffer(a) ? a : Buffer.from(a);
    const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  private deriveKey(secret: string | Buffer, salt: Buffer): Buffer {
    return scryptSync(secret, salt, KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    });
  }

  private aesGcmEncrypt(key: Buffer, plaintext: Buffer): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
  }

  private aesGcmDecrypt(key: Buffer, packed: string): Buffer {
    const buf = Buffer.from(packed, 'base64');
    if (buf.length < IV_LEN + TAG_LEN) {
      throw new Error('Ciphertext too short.');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}