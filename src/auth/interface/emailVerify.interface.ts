export interface EmailVerifyResult {
  verified: boolean | null;
}

export interface EmailVerifyQueryInterface {
  email_verified: boolean;
}