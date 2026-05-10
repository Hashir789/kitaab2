export interface refreshTokenResultInterface {
  access_token: string;
}

export interface refreshTokenQueryInterface {
  id: number;
  email: string;
  email_verified: boolean;
  refresh_token_hash: string | null;
}