export interface TrackVisitorsQueryInterface  {
  id: string;
  ip: string;
  created_at: Date;
  last_visited: Date;
  city: string | null;
  device_type: string;
  anonymous_id: string;
  country: string | null;
  number_of_visits: number;
};