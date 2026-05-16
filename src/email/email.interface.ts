export interface SendOtpVerificationEmailBody {
  otp: string;
  email: string;
  full_name: string;
  expires_in_minutes: number;
}

export interface SendPasswordResetEmailBody {
  email: string;
  full_name: string;
  plain_token?: string;
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