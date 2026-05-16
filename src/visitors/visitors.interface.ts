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