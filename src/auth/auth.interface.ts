import { Request } from 'express';

export interface JwtAuthUser {
  sub: number;
  email: string;
  type: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtAuthUser;
}