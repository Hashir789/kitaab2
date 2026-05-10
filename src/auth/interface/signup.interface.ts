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
  dob: string;
  email: string;
  gender: string;
  created_at: Date;
  full_name: string;
  access_token: string;
  refresh_token: string;
  email_verified: string;
  two_factor_enabled: boolean;
}

export interface signupUpdateQueryInterface {
  id: number;
}