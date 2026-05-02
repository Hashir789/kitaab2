import { join } from 'path';
import { readFile } from 'fs/promises';
import * as nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { SendOtpVerificationEmailBody } from './interface/SendOtpVerificationEmail.interface';
import { SendVisitorEmailCopyBody } from './interface/SendVisitorEmailCopy.interface';
import { SendVisitorMessageCopyEmailBody } from './interface/SendVisitorMessageCopyEmail.interface';

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
    const { email, name, otp, expiresInMinutes } = body;
    const templatePath = join(process.cwd(), 'src', 'templates', 'otp-verification.html');
    const template = await readFile(templatePath, 'utf-8');
    const html = template
      .replaceAll('{{name}}', name)
      .replaceAll('{{expiresInMinutes}}', String(expiresInMinutes))
      .replaceAll('{{otp}}', otp);
    await this.transporter.sendMail({
      from: `"${this.configService.get<string>('EMAIL_NAME')}" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Your one-time password — Kitaab',
      html,
    });
  }

  async sendVisitorMessageCopyEmail(body: SendVisitorMessageCopyEmailBody): Promise<void> {
    this.loggerService.log('sendVisitorMessageCopyEmail {helper}');
    const { name, email, phone, subject, message, timezone } = body;
    const templatePath = join(process.cwd(), 'src', 'templates', 'contact-form-copy.html');
    const template = await readFile(templatePath, 'utf-8');
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
      subject: 'Copy of your message - Kitaab',
      html,
    });
  }

  async sendVisitorEmailCopy(body: SendVisitorEmailCopyBody): Promise<void> {
    this.loggerService.log('sendVisitorEmailCopy {helper}');
    const { email, timezone, created_at } = body;
    const templatePath = join(process.cwd(), 'src', 'templates', 'waitlist-email.html');
    const template = await readFile(templatePath, 'utf-8');
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
      subject: 'We’ve received your message - Kitaab',
      html,
    });
  }
}
