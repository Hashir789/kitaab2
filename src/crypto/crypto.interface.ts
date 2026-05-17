import { webcrypto } from 'node:crypto';

type AesGcmKey = webcrypto.CryptoKey;

export interface PrepareSignupStorageResultInterface {
  email: string;
  secret: string;
  key_salt: string;
  key_iv: string;
  full_name: string;
  encrypted_master_key: string;
  recovery_key_iv: string | null;
  recovery_key_salt: string | null;
  recovery_encrypted_master_key: string | null;
}

export interface PrepareSignupStorageBodyInterface {
  password: string,
  fields: {
    full_name: string;
    email: string;
    secret: string;
  },
  recovery_key: string;
}

export interface WrapMasterKeyBodyInterface {
  password: string;
  raw_master_key: ArrayBuffer;
}

export interface DeriveKeyBodyInterface {
  password: string;
  salt: Uint8Array;
}

export interface EncryptWithKeyBodyInterface {
  key: AesGcmKey;
  iv: Uint8Array;
  plaintext: string;
}

export interface DecryptWithKeyBodyInterface {
  key: AesGcmKey;
  ciphertext: string;
}