export class CheckDatabaseConnectionsResponseInterface {
  redis: boolean;
  postgres: boolean;
}

export interface DailyReportResponseInterface {
  visitors: {
    clicks: number;
    navigations: number;
    new_visitors: number;
    total_visitors: number;
    visitor_emails: number;
    visitor_messages: number;
    returning_visitors: number;
    timezones: Record<string, number>;
  };
  users: {
    male: number;
    female: number;
    new_users: number;
    total_users: number;
    returning_users: number;
    age: Record<string, number>;
  };
  conversion: number;
}