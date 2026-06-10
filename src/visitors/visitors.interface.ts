export interface VisitorEmailsQueryInterface {
  id: number;
  email: string;
  created_at: Date;
  timezone: string;
  visitor_id: number;
};

export interface VisitorMessagesQueryInterface {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  created_at: Date;
  timezone: string;
  visitor_id: number;
};

export interface TrackVisitorsQueryInterface {
  number_of_visits: number;
};

export interface AnalyticsSummaryResponse {
  summary: {
    clicks: number;
    navigations: number;
    visitors: number;
    visits: number;
  };
  device_distribution: Array<{ device_type: string; count: number }>;
  timezones: Array<{ timezone: string; count: number }>;
};

export interface AnalyticsAssociationResponse<T> {
  anonymous_id: string;
  details: T[];
};

export interface AnalyticsTableResponse<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
};