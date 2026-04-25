export interface SendVisitorMessageCopyEmailBody {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  timezone: string;
}