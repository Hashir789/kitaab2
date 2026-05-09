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