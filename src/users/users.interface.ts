export type UserAnalyticsType = 'users_table' | 'gender_ratio' | 'age_distribution' | 'visitors_association';

export interface MeResult {
  id: number;
  dob: string;
  email: string;
  gender: string;
  key_iv: string;
  key_salt: string;
  created_at: Date;
  full_name: string;
  encrypted_master_key: string;
}

export interface MeQueryInterface {
  id: number;
  dob: string;
  email: string;
  gender: string;
  key_iv: string;
  key_salt: string;
  created_at: Date;
  full_name: string;
  encrypted_master_key: string;
}

export interface UserTableRow {
  dob: Date;
  id: number;
  gender: string;
  created_at: Date;
  visitor_id: number;
  last_login_at: Date;
  email_verified: boolean;
  two_factor_enabled: boolean;
};

export interface UserTableResponse {
  page: number;
  limit: number;
  total: number;
  rows: UserTableRow[];
};

export interface GenderRatioResponse {
  total: number;
  distribution: Array<{ gender: string; count: number; percentage: number }>;
};

export interface AgeDistributionResponse {
  total: number;
  distribution: Array<{ age: number; count: number }>;
};

export interface VisitorAssociationRow {
  id: number;
  clicks: number;
  timezone: string;
  last_visited: Date;
  navigations: number;
  anonymous_id: string;
  number_of_visits: number;
  device_type: 'desktop' | 'tablet' | 'mobile';
};

export interface VisitorsAssociationResponse {
  id: string;
  details: VisitorAssociationRow[];
};