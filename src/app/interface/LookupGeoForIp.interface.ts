export interface LookupGeoForIpBody  {
  ip: string;
  timezone: string;
};

export interface LookupGeoForIpResult  {
  city: string | null;
  country: string | null;
};