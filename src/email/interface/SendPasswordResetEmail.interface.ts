export interface SendPasswordResetEmailBody {
  email: string;
  name: string;
  resetLink: string | null;
  plainToken?: string;
  expiresInMinutes: number;
}