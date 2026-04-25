import { join } from 'path';
import { readFile } from 'fs/promises';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { TrackVisitorsDto } from './dto/TrackVisitors.dto';
import { VisitorMessagesDto } from './dto/VisitorMessages.dto';
import { RedisService } from '../database/redis/redis.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { TrackVisitorsQueryInterface } from './interface/TrackVisitors.interface';
import { LookupGeoForIpBody, LookupGeoForIpResult } from './interface/LookupGeoForIp.interface';
import { SendVisitorMessageCopyEmailBody } from './interface/SendVisitorMessageCopyEmail.interface';
import { CheckDatabaseConnectionsResponseInterface } from './interface/CheckDatabaseConnections.interface';

@Injectable()
export class AppService {

  private readonly transporter: nodemailer.Transporter;
  
  constructor(
    private readonly loggerService: Logger,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly postgresService: PostgresService
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      }
    });
  }
  
  // controller functions

  healthCheck() {
    this.loggerService.log('healthCheck {controller}');
  }
  
  async checkDatabaseConnections(): Promise<{ data: CheckDatabaseConnectionsResponseInterface, statusCode: 200}> {
    try {
      this.loggerService.log('checkDatabaseConnections {controller}');
      const [postgres, redis] = await Promise.allSettled([ this.tryPostgres(), this.tryRedis() ]);
      return {
        data: {
          redis: redis.status === 'fulfilled',
          postgres: postgres.status === 'fulfilled',
        },
        statusCode: 200
      };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  async trackVisitor(payload: TrackVisitorsDto, ip: string): Promise<void> {
    try {
      this.loggerService.log('trackVisitor {controller}');
      const { timezone, anonymous_id, device_type } = payload;
      const clientIp = this.normalizeClientIp(ip);
      const { city, country } = await this.lookupGeoForIp({ ip: clientIp, timezone });
      await this.postgresService.query<TrackVisitorsQueryInterface>(`
        INSERT INTO visitors (anonymous_id, ip, city, country, timezone, device_type)
        VALUES ($1, $2::inet, $3, $4, $5, $6)
        ON CONFLICT (anonymous_id)
        DO UPDATE SET
          ip = EXCLUDED.ip,
          city = EXCLUDED.city,
          country = EXCLUDED.country,
          timezone = EXCLUDED.timezone,
          device_type = EXCLUDED.device_type,
          number_of_visits = visitors.number_of_visits + 1,
          last_visited = NOW()
      `, [anonymous_id, clientIp, city, country, timezone, device_type]);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException('Failed to record visitor', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async visitorMessages(payload: VisitorMessagesDto): Promise<void> {
    try {
      this.loggerService.log('visitorMessages {controller}');
      const { anonymous_id, name, email, subject, phone, message } = payload;
      const rows = await this.postgresService.query<TrackVisitorsQueryInterface>(`
        WITH inserted AS (
          INSERT INTO visitor_messages (visitor_id, name, email, subject, phone, message)
          SELECT v.id, $1, $2, $3, $4, $5
          FROM visitors v
          WHERE v.anonymous_id = $6
          RETURNING *
        )
        SELECT i.*, v.timezone
        FROM inserted i
        JOIN visitors v ON v.id = i.visitor_id;
      `, [name, email, subject, phone, message, anonymous_id]);
      await this.sendVisitorMessageCopyEmail({ name, email, subject, phone, message, timezone: rows[0].timezone })
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException('Failed to record visitor', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // helper functions
  
  private async tryPostgres(): Promise<void> {
    this.loggerService.log('tryPostgres {helper}');
    await this.postgresService.ping();
  }
  
  private async tryRedis(): Promise<void> {
    this.loggerService.log('tryRedis {helper}');
    await this.redisService.ping();
  }
  
  private async lookupGeoForIp(body: LookupGeoForIpBody): Promise<LookupGeoForIpResult> {
    this.loggerService.log('lookupGeoForIp {helper}');
    const url = `http://ip-api.com/json/${encodeURIComponent(body.ip)}`;
    const response = await fetch(url);
    const data = await response.json();
    return {
      city: data.city,
      country: data.country
    };
  }

  private normalizeClientIp(ip: string): string {
    this.loggerService.log('normalizeClientIp {helper}');
    return ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/i, '');
  }

  private async sendVisitorMessageCopyEmail(body: SendVisitorMessageCopyEmailBody): Promise<void> {
    this.loggerService.log('sendVisitorMessageCopyEmail {helper}');
    const { name, email, phone, subject, message, timezone } = body;
    const templatePath = join(process.cwd(), 'src', 'templates', 'contact-form-copy.html');
    const template = await readFile(templatePath, 'utf-8');
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(now);
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
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
      html
    });
  }
}