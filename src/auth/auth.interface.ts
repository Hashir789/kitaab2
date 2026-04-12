import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  
  user?: {
    id: number,
    name: string,
    email: string,
    two_fa: Boolean,
    join_date: Date
  };
}