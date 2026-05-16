import { join } from 'path';
import { readFile } from 'fs/promises';
import * as nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { SendVisitorEmailCopyBody, SendPasswordResetEmailBody, SendOtpVerificationEmailBody, SendVisitorMessageCopyEmailBody } from './email.interface';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly loggerService: Logger,
    private readonly configService: ConfigService
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      },
    });
  }

  async sendOtpVerificationEmail(body: SendOtpVerificationEmailBody): Promise<void> {
    this.loggerService.log('sendOtpVerificationEmail {helper}');
    const { email, full_name, otp, expires_in_minutes } = body;
    const template_path = join(process.cwd(), 'src', 'templates', 'otp-verification.html');
    const template = await readFile(template_path, 'utf-8');
    const html = template
      .replaceAll('{{name}}', full_name)
      .replaceAll('{{expiresInMinutes}}', String(expires_in_minutes))
      .replaceAll('{{otp}}', otp);
    await this.transporter.sendMail({
      from: `"${this.configService.get<string>('EMAIL_NAME')}" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Your one-time password',
      html,
    });
  }

  async sendPasswordResetEmail(body: SendPasswordResetEmailBody): Promise<void> {
    this.loggerService.log('sendPasswordResetEmail {helper}');
    const { email, full_name, reset_link, plain_token, expires_in_minutes } = body;
    const template_path = join(process.cwd(), 'src', 'templates', 'password-reset.html');
    const template = await readFile(template_path, 'utf-8');
    let reset_action: string;
    if (reset_link) {
      reset_action = `
      <a href="${reset_link}"
         style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;color:#f0f0f0;background-color:#646464;">
        Reset password
      </a>`;
    } else if (plain_token) {
      reset_action = `
      <p style="margin:0 0 10px 0;font-size:13px;color:#787878;">Use this token with the password reset step before it expires:</p>
      <p style="margin:0;padding:12px 16px;font-size:14px;font-weight:600;word-break:break-all;border-radius:8px;border:1px solid #e6e6e6;background-color:#ffffff;font-family:ui-monospace,Menlo,Consolas,monospace;color:#5a5a5a;">
        ${plain_token}
      </p>`;
    } else {
      reset_action =
        '<p style="margin:0;font-size:13px;color:#787878;">If you still need access, try requesting another reset from the app.</p>';
    }
    const html = template
      .replaceAll('{{name}}', full_name)
      .replaceAll('{{expiresInMinutes}}', String(expires_in_minutes))
      .replaceAll('{{resetAction}}', reset_action);
    await this.transporter.sendMail({
      from: `"${this.configService.get<string>('EMAIL_NAME')}" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Reset your password',
      html,
    });
  }

  async sendVisitorMessageCopyEmail(body: SendVisitorMessageCopyEmailBody): Promise<void> {
    this.loggerService.log('sendVisitorMessageCopyEmail {helper}');
    const { name, email, phone, subject, message, timezone } = body;
    const template_path = join(process.cwd(), 'src', 'templates', 'contact-form-copy.html');
    const template = await readFile(template_path, 'utf-8');
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(now);
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(now);
    const html = template
      .replaceAll('{{name}}', name)
      .replaceAll('{{date}}', date)
      .replaceAll('{{time}}', time)
      .replaceAll('{{email}}', email)
      .replaceAll('{{subject}}', subject)
      .replaceAll('{{message}}', message)
      .replaceAll('{{timezone}}', timezone)
      .replaceAll('{{phone}}', phone || '---');
    await this.transporter.sendMail({
      from: `"${this.configService.get<string>('EMAIL_NAME')}" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: body.email,
      subject: 'Copy of your message',
      html,
    });
  }

  async sendVisitorEmailCopy(body: SendVisitorEmailCopyBody): Promise<void> {
    this.loggerService.log('sendVisitorEmailCopy {helper}');
    const { email, timezone, created_at } = body;
    const template_path = join(process.cwd(), 'src', 'templates', 'waitlist-email.html');
    const template = await readFile(template_path, 'utf-8');
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(created_at);
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(created_at);
    const html = template
      .replaceAll('{{date}}', date)
      .replaceAll('{{time}}', time)
      .replaceAll('{{email}}', email)
      .replaceAll('{{timezone}}', timezone);
    await this.transporter.sendMail({
      from: `"${this.configService.get<string>('EMAIL_NAME')}" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: body.email,
      subject: 'We’ve received your message',
      html,
    });
  }
}
