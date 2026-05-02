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
  two_factor_enabled: boolean;
}