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