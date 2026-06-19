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
  id: number;
  visitor_id: number;
  gender: string;
  dob: Date;
  email_verified: boolean;
  two_factor_enabled: boolean;
  last_login_at: Date;
  created_at: Date;
};

export interface UserTableResponse {
  rows: UserTableRow[];
  total: number;
  page: number;
  limit: number;
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
  anonymous_id: string;
  timezone: string;
  device_type: 'desktop' | 'tablet' | 'mobile';
  clicks: number;
  navigations: number;
  number_of_visits: number;
  last_visited: Date;
};

export interface VisitorsAssociationResponse {
  id: string;
  details: VisitorAssociationRow[];
};