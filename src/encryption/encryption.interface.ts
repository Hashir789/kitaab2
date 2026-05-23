export interface VaultKdfParamsInterface {
  N: number;
  r: number;
  p: number;
  algorithm: 'scrypt';
}

export interface VaultRecordInterface {
  password_salt: string;
  recovery_salt: string;
  wrapped_by_password: string;
  wrapped_by_recovery: string;
  kdf: VaultKdfParamsInterface;
}

export interface CreateVaultBodyInterface {
  password: string;
  recovery_secret?: string;
}

export interface CreateVaultResultInterface {
  master_key: Buffer;
  recovery_key: string | null;
  record: VaultRecordInterface;
}

export interface SplitPackedBlobResultInterface {
  iv: string;
  ciphertext: string;
}

export interface UnlockWithPasswordBodyInterface {
  password: string;
  record: VaultRecordInterface;
}

export interface UnlockWithRecoveryKeyBodyInterface {
  recovery_key: string;
  record: VaultRecordInterface;
}

export interface UnlockMasterKeyWithPasswordBodyInterface {
  key_iv: string;
  password: string;
  key_salt: string;
  encrypted_master_key: string;
}

export interface UnlockMasterKeyWithRecoveryKeyBodyInterface {
  recovery_key: string;
  recovery_key_iv: string;
  recovery_key_salt: string;
  recovery_encrypted_master_key: string;
}

export interface WrapMasterKeyWithPasswordBodyInterface {
  password: string;
  master_key: Buffer;
}

export interface WrappedMasterKeyResultInterface {
  key_iv: string;
  key_salt: string;
  encrypted_master_key: string;
}

export interface EncryptFieldBodyInterface {
  plaintext: string;
  master_key: Buffer;
}

export interface DecryptFieldBodyInterface {
  master_key: Buffer;
  ciphertext: string;
}

export interface ChangePasswordBodyInterface {
  new_password: string;
  current_password: string;
  record: VaultRecordInterface;
}

export interface RotateRecoveryKeyBodyInterface {
  password: string;
  record: VaultRecordInterface;
}

export interface RotateRecoveryKeyResultInterface {
  recovery_key: string;
  record: VaultRecordInterface;
}