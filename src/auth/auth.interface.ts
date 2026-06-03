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

export interface ChangePasswordSelectQueryInterface {
  id: string;
  key_iv: string;
  key_salt: string;
  password_hash: string;
  encrypted_master_key: string;
}

export interface ChangePasswordUpdateQueryInterface {
  id: string;
}

export interface EmailVerifyResult {
  verified: boolean | null;
}

export interface EmailVerifyQueryInterface {
  email_verified: boolean;
}

export interface ForgotPasswordQueryInterface {
  id: string;
}

export interface loginResult {
  dob: string;
  email: string;
  gender: string;
  key_iv: string;
  created_at: Date;
  key_salt: string;
  full_name: string;
  access_token: string;
  email_verified: boolean;
  two_factor_enabled: boolean;
  encrypted_master_key: string;
}
  
export interface loginQueryInterface {
  id: number;
  dob: string;
  email: string;
  gender: string;
  key_iv: string;
  created_at: Date;
  key_salt: string;
  full_name: string;
  password_hash: string;
  email_verified: boolean;
  two_factor_enabled: boolean;
  encrypted_master_key: string;
}

export interface otpVerifyQueryInterface {
  id: number;
}

export interface OtpVerifyResult {
  access_token: string;
}

export interface resendLinkGetQueryInterface {
  email_verified: boolean;
}

export interface ResetPasswordSelectQueryInterface {
  id: string;
  recovery_key_iv: string;
  recovery_key_salt: string;
  recovery_encrypted_master_key: string;
}

export interface ResetPasswordUpdateQueryInterface {
  id: string;
}

export interface SignupResult {
  dob: string;
  email: string;
  gender: string;
  key_iv: string;
  key_salt: string;
  created_at: Date;
  full_name: string;
  access_token: string;
  encrypted_master_key: string;
}

export interface signupInsertQueryInterface {
  id: number;
  created_at: Date;
  email_verified: boolean;
}

export interface Update2FaGetQueryInterface {
  email_verified: boolean;
}

export interface Update2FaPatchQueryInterface {
  two_factor_enabled: boolean;
}