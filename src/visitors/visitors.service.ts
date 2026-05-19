import { Logger } from '../logger/logger.service';
import { EmailService } from '../email/email.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { TrackVisitorsDto, VisitorEmailsDto, VisitorMessagesDto } from './visitors.dto';
import { VisitorEmailsQueryInterface, VisitorMessagesQueryInterface } from './visitors.interface';

@Injectable()
export class VisitorService {

  constructor(
    private readonly loggerService: Logger,
    private readonly emailService: EmailService,
    private readonly postgresService: PostgresService
  ) {}
  
  // controller functions

  async trackVisitor(payload: TrackVisitorsDto): Promise<void> {
    try {
      this.loggerService.log('trackVisitor {controller}');
      const { timezone, anonymous_id, device_type, clicks, navigations } = payload;
      await this.postgresService.query<void>(`
        INSERT INTO visitors (anonymous_id, timezone, device_type, clicks, navigations)
        VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, 0))
        ON CONFLICT (anonymous_id)
        DO UPDATE SET
          timezone = EXCLUDED.timezone,
          device_type = EXCLUDED.device_type,
          clicks = visitors.clicks + COALESCE(EXCLUDED.clicks, 0),
          navigations = visitors.navigations + COALESCE(EXCLUDED.navigations, 0),
          number_of_visits = visitors.number_of_visits + 1,
          last_visited = NOW()
      `, [anonymous_id, timezone, device_type, clicks, navigations]);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async visitorAnalytics(include = 'totals,timezone,visitors'): Promise<any> {
    try {
      this.loggerService.log('visitorAnalytics {controller}');
      const allowedIncludes = ['totals', 'timezone', 'visitors'];
      const includes = include.split(',').map((value) => value.trim()).filter(Boolean);
      const invalidInclude = includes.find((value) => !allowedIncludes.includes(value));
      if (invalidInclude) {
        this.loggerService.error('Invalid analytics include value', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid analytics include value', HttpStatus.BAD_REQUEST);
      }
      const analytics: any = {};

      if (includes.includes('totals')) {
        const [totals] = await this.postgresService.query<any>(`
          SELECT
            COUNT(*)::int AS visitors,
            COALESCE(SUM(clicks), 0)::int AS clicks,
            COALESCE(SUM(navigations), 0)::int AS navigations
          FROM visitors;
        `);
        analytics.totals = {
          visitors: Number(totals?.visitors ?? 0),
          clicks: Number(totals?.clicks ?? 0),
          navigations: Number(totals?.navigations ?? 0),
        };
      }

      if (includes.includes('timezone')) {
        const rows = await this.postgresService.query<any>(`
          SELECT timezone, COUNT(*)::int AS count
          FROM visitors
          GROUP BY timezone
          ORDER BY timezone;
        `);
        analytics.timezoneDistribution = rows.reduce((distribution, row) => {
          distribution[row.timezone] = Number(row.count);
          return distribution;
        }, {});
      }

      if (includes.includes('visitors')) {
        const rows = await this.postgresService.query<any>(`
          SELECT
            v.id,
            v.anonymous_id,
            v.timezone,
            v.clicks,
            v.navigations,
            COALESCE(messages.visitor_messages, '[]'::json) AS visitor_messages,
            COALESCE(emails.visitor_emails, '[]'::json) AS visitor_emails
          FROM visitors v
          LEFT JOIN LATERAL (
            SELECT json_agg(
              json_build_object(
                'id', vm.id,
                'name', vm.name,
                'email', vm.email,
                'subject', vm.subject,
                'phone', vm.phone,
                'message', vm.message,
                'created_at', vm.created_at
              )
              ORDER BY vm.created_at DESC
            ) AS visitor_messages
            FROM visitor_messages vm
            WHERE vm.visitor_id = v.id
          ) messages ON true
          LEFT JOIN LATERAL (
            SELECT json_agg(
              json_build_object(
                'id', ve.id,
                'email', ve.email,
                'created_at', ve.created_at
              )
              ORDER BY ve.created_at DESC
            ) AS visitor_emails
            FROM visitor_emails ve
            WHERE ve.visitor_id = v.id
          ) emails ON true
          ORDER BY v.last_visited DESC NULLS LAST, v.id DESC;
        `);
        analytics.visitors = rows.map((visitor) => ({
          id: Number(visitor.id),
          anonymous_id: visitor.anonymous_id,
          timezone: visitor.timezone,
          clicks: Number(visitor.clicks),
          navigations: Number(visitor.navigations),
          visitor_messages: visitor.visitor_messages ?? [],
          visitor_emails: visitor.visitor_emails ?? [],
        }));
      }

      return analytics;
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
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
        this.loggerService.error('Visitor not found', HttpStatus.NOT_FOUND);
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }
      await this.emailService.sendVisitorMessageCopyEmail({ name, email, subject, phone, message, timezone: rows[0].timezone });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
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
        this.loggerService.error('Visitor not found', HttpStatus.NOT_FOUND);
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }
      const { timezone, created_at } = rows[0];
      await this.emailService.sendVisitorEmailCopy({ email, timezone, created_at });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
