import { Logger } from '../logger/logger.service';
import { EmailService } from '../email/email.service';
import { TrackVisitorsDto } from './dto/TrackVisitors.dto';
import { VisitorEmailsDto } from './dto/VisitorEmails.dto';
import { VisitorMessagesDto } from './dto/VisitorMessages.dto';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { VisitorEmailsQueryInterface } from './interface/VisitorEmails.interface';
import { VisitorMessagesQueryInterface } from './interface/VisitorMessages.interface';
import { LookupGeoForIpBody, LookupGeoForIpResult } from './interface/LookupGeoForIp.interface';

@Injectable()
export class VisitorService {

  constructor(
    private readonly loggerService: Logger,
    private readonly emailService: EmailService,
    private readonly postgresService: PostgresService
  ) {}
  
  // controller functions

  async trackVisitor(payload: TrackVisitorsDto, ip: string): Promise<void> {
    try {
      this.loggerService.log('trackVisitor {controller}');
      const { timezone, anonymous_id, device_type } = payload;
      const clientIp = this.normalizeClientIp(ip);
      const { city, country } = await this.lookupGeoForIp({ ip: clientIp, timezone });
      await this.postgresService.query<void>(`
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
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  async visitorMessages(payload: VisitorMessagesDto): Promise<void> {
    try {
      this.loggerService.log('visitorMessages {controller}');
      const { anonymous_id, name, email, subject, phone, message } = payload;
      const rows = await this.postgresService.query<VisitorMessagesQueryInterface>(`
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
      if (!rows?.length) {
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }
      await this.emailService.sendVisitorMessageCopyEmail({ name, email, subject, phone, message, timezone: rows[0].timezone });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  async visitorEmails(payload: VisitorEmailsDto): Promise<void> {
    try {
      this.loggerService.log('visitorEmails {controller}');
      const { anonymous_id, email } = payload;
      const rows = await this.postgresService.query<VisitorEmailsQueryInterface>(`
        INSERT INTO visitor_emails (visitor_id, email)
        SELECT v.id, $1
        FROM visitors v
        WHERE v.anonymous_id = $2
        ON CONFLICT (email)
        DO UPDATE SET
          visitor_id = EXCLUDED.visitor_id
        RETURNING *;
      `, [email, anonymous_id]);
      if (!rows?.length) {
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }
      const { timezone, created_at } = rows[0];
      await this.emailService.sendVisitorEmailCopy({ email, timezone, created_at });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  // helper functions
  
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
}