import { Request } from 'express';

export interface JwtAuthUser {
  sub: number;
  type: string;
  iat?: number;
  exp?: number;
  email: string;
  email_verified: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: JwtAuthUser;
}

export interface ChangePasswordQueryInterface {
  id: string;
  password_hash: string;
}

export interface EmailVerifyResult {
  verified: boolean | null;
}

export interface EmailVerifyQueryInterface {
  email_verified: boolean;
}

export interface ForgotPasswordQueryInterface {
  id: string;
  full_name: string;
}

export interface loginResult {
  dob: string;
  email: string;
  gender: string;
  created_at: Date;
  full_name: string;
  access_token: string;
  refresh_token: string;
  two_factor_enabled: boolean;
}
  
export interface loginQueryInterface {
  id: number;
  dob: string;
  email: string;
  gender: string;
  created_at: Date;
  full_name: string;
  access_token: string;
  refresh_token: string;
  two_factor_enabled: boolean;
}

export interface loginQueryInterface {
  id: number;
  dob: string;
  email: string;
  gender: string;
  created_at: Date;
  full_name: string;
  password_hash: string;
  email_verified: boolean;
  two_factor_enabled: boolean;
}

export interface MeResult {
  dob: string;
  email: string;
  gender: string;
  full_name: string;
  created_at: string;
  two_factor_enabled: boolean;
  access_token: string;
}

export interface otpVerifyQueryInterface {
  secret: string;
  email_verified: boolean;
}

export interface otpVerifyResult {
  verified: boolean;
}

export interface refreshTokenResultInterface {
  access_token: string;
}

export interface refreshTokenQueryInterface {
  id: number;
  email: string;
  email_verified: boolean;
  refresh_token_hash: string | null;
}

export interface resendLinkGetQueryInterface {
  full_name: string;
  email_verified: boolean;
}

export interface resendLinkUpdateQueryInterface {
  id: number;
}

export interface ResetPasswordQueryInterface {
  id: string;
}

export interface signupResult {
  dob: string;
  email: string;
  gender: string;
  created_at: Date;
  full_name: string;
  access_token: string;
  refresh_token: string;
  two_factor_enabled: boolean;
}

export interface signupInsertQueryInterface {
  id: number;
  created_at: Date;
  email_verified: string;
  two_factor_enabled: boolean;
}

export interface signupUpdateQueryInterface {
  id: number;
}

export interface Update2FaGetQueryInterface {
  secret: string;
  email_verified: boolean;
}

export interface Update2FaPatchQueryInterface {
  two_factor_enabled: boolean;
}

export interface verifyOtpResult {
  otp: string;
  secret: string;
}