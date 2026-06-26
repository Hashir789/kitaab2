export interface SendOtpVerificationEmailBody {
  otp: string;
  email: string;
  full_name?: string;
  expires_in_minutes: number;
}

export interface SendPasswordResetEmailBody {
  email: string;
  full_name: string;
  reset_link: string | null;
  expires_in_minutes: number;
}

export interface SendVisitorEmailCopyBody {
  email: string;
  timezone: string;
  created_at: Date;
}

export interface SendVisitorMessageCopyEmailBody {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  timezone: string;
}

export interface SendDailyReportEmailBody {
  email: string;
  date: string;
  visitors: {
    clicks: number;
    navigations: number;
    new_visitors: number;
    total_visitors: number;
    visitor_emails: number;
    visitor_messages: number;
    returning_visitors: number;
    timezones: Record<string, number>;
    device_types: Record<string, number>;
  };
  users: {
    male: number;
    female: number;
    new_users: number;
    total_users: number;
    returning_users: number;
    age: Record<string, number>;
  };
  deeds: {
    new_deeds: number;
    hasanaat: number;
    saiyyiaat: number;
  };
  conversion: number;
}