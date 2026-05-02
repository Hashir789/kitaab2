export interface SendOtpVerificationEmailBody {
  otp: string;
  name: string;
  email: string;
  expiresInMinutes: number;
}