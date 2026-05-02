export interface otpVerifyQueryInterface {
  secret: string;
  email_verified: boolean;
}

export interface otpVerifyResult {
  verified: boolean;
}