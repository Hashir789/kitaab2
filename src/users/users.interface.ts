export interface UserTableResponse<T> {
  rows: T[];
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