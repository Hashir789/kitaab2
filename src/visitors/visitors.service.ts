import { Logger } from '../logger/logger.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../database/redis/redis.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { TrackVisitorsDto, VisitorAnalyticsDto, VisitorEmailsDto, VisitorMessagesDto } from './visitors.dto';
import { AnalyticsAssociationResponse, AnalyticsSummaryResponse, AnalyticsTableResponse, TrackVisitorsQueryInterface, VisitorEmailsQueryInterface, VisitorMessagesQueryInterface } from './visitors.interface';

@Injectable()
export class VisitorService {

  constructor(
    private readonly loggerService: Logger,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
    private readonly postgresService: PostgresService
  ) {}
  
  // controller functions

  async trackVisitor(payload: TrackVisitorsDto): Promise<void> {
    try {
      this.loggerService.log('trackVisitor {controller}');
      const { timezone, anonymous_id, device_type, clicks, navigations } = payload;
      const rows = await this.postgresService.query<TrackVisitorsQueryInterface>(`
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
        RETURNING number_of_visits
      `, [anonymous_id, timezone, device_type, clicks, navigations]);
      const visitor = rows?.[0]?.number_of_visits === 1 ? 'new_visitors': 'returning_visitors';
      this.redisService.incrementBy('report:clicks', clicks ?? 0)
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
      this.redisService.incrementBy('report:navigations', navigations ?? 0)
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
      this.redisService.incrementInHash('report:device_types', device_type, 1)
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
      this.redisService.incrementInHash('report:timezones', timezone, 1)
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
      this.redisService.incrementBy(`report:${visitor}`, 1)
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async visitorAnalytics(query: VisitorAnalyticsDto): Promise<AnalyticsSummaryResponse | AnalyticsAssociationResponse<any> | AnalyticsTableResponse<any>> {
    try {
      this.loggerService.log('visitorAnalytics {controller}');
      const { type, anonymous_id, page = 1, limit = 20 } = query;
      switch (type) {
        case 'summary':
          return this.analyticsSummary();
        case 'users_association':
          return this.analyticsAssociation(this.requireAnonymousId(anonymous_id), 'users', 't.id, t.gender, t.dob, t.email_verified, t.two_factor_enabled, t.last_login_at, t.created_at');
        case 'messages_association':
          return this.analyticsAssociation(this.requireAnonymousId(anonymous_id), 'visitor_messages', 't.id, t.name, t.email, t.subject, t.phone, t.message, t.created_at');
        case 'emails_association':
          return this.analyticsAssociation(this.requireAnonymousId(anonymous_id), 'visitor_emails', 't.id, t.email, t.created_at');
        case 'visitors_table':
          return this.analyticsTable('visitors', 'last_visited DESC NULLS LAST, id DESC', page, limit);
        case 'visitor_messages_table':
          return this.analyticsTable('visitor_messages', 'created_at DESC, id DESC', page, limit);
        case 'visitor_emails_table':
          return this.analyticsTable('visitor_emails', 'created_at DESC, id DESC', page, limit);
        default:
          this.loggerService.error('Invalid analytics type', HttpStatus.BAD_REQUEST);
          throw new HttpException('Invalid analytics type', HttpStatus.BAD_REQUEST);
      }
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
      this.emailService.sendVisitorMessageCopyEmail({ name, email, subject, phone, message, timezone: rows[0].timezone })
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
      this.redisService.incrementBy('report:messages', 1)
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
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
        WITH inserted AS (
          INSERT INTO visitor_emails (visitor_id, email)
          SELECT v.id, $1
          FROM visitors v
          WHERE v.anonymous_id = $2
          ON CONFLICT (email)
          DO UPDATE SET
            visitor_id = EXCLUDED.visitor_id
          RETURNING *
        )
        SELECT i.*, v.timezone
        FROM inserted i
        JOIN visitors v ON v.id = i.visitor_id;
      `, [email, anonymous_id]);
      if (!rows?.length) {
        this.loggerService.error('Visitor not found', HttpStatus.NOT_FOUND);
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }
      const { timezone, created_at } = rows[0];
      this.emailService.sendVisitorEmailCopy({ email, timezone, created_at })
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
      this.redisService.incrementBy('report:emails', 1)
        .catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // helper functions

  private async analyticsSummary(): Promise<AnalyticsSummaryResponse> {
    this.loggerService.log('analyticsSummary {helper}');
    const [[totals], devices, timezones] = await Promise.all([
      this.postgresService.query<{ clicks: number; navigations: number; visitors: number; visits: number }>(`
        SELECT
          COUNT(*)::int AS visitors,
          COALESCE(SUM(clicks), 0)::int AS clicks,
          COALESCE(SUM(navigations), 0)::int AS navigations,
          COALESCE(SUM(number_of_visits), 0)::int AS visits
        FROM visitors;
      `),
      this.postgresService.query<{ device_type: string; count: number }>(`
        SELECT device_type, COUNT(*)::int AS count
        FROM visitors
        WHERE device_type IS NOT NULL
        GROUP BY device_type
        ORDER BY count DESC, device_type ASC;
      `),
      this.postgresService.query<{ timezone: string; count: number }>(`
        SELECT timezone, COUNT(*)::int AS count
        FROM visitors
        WHERE timezone IS NOT NULL
        GROUP BY timezone
        ORDER BY count DESC, timezone ASC;
      `)
    ]);
    return {
      summary: {
        clicks: Number(totals?.clicks ?? 0),
        navigations: Number(totals?.navigations ?? 0),
        visitors: Number(totals?.visitors ?? 0),
        visits: Number(totals?.visits ?? 0)
      },
      device_distribution: devices.map((row) => ({ device_type: row.device_type, count: Number(row.count) })),
      timezones: timezones.map((row) => ({ timezone: row.timezone, count: Number(row.count) }))
    };
  }

  private requireAnonymousId(anonymous_id?: string): string {
    this.loggerService.log('requireAnonymousId {helper}');
    if (!anonymous_id) {
      this.loggerService.error('anonymous_id is required for association queries', HttpStatus.BAD_REQUEST);
      throw new HttpException('anonymous_id is required for association queries', HttpStatus.BAD_REQUEST);
    }
    return anonymous_id;
  }

  private async analyticsAssociation(anonymous_id: string, table: 'users' | 'visitor_messages' | 'visitor_emails', columns: string): Promise<AnalyticsAssociationResponse<any>> {
    this.loggerService.log(`analyticsAssociation {helper} table=${table} anonymous_id=${anonymous_id}`);
    const rows = await this.postgresService.query<any>(`
      SELECT ${columns}
      FROM ${table} t
      JOIN visitors v ON v.id = t.visitor_id
      WHERE v.anonymous_id = $1
      ORDER BY t.id ASC;
    `, [anonymous_id]);
    return { anonymous_id, details: rows };
  }

  private async analyticsTable(table: 'visitors' | 'visitor_messages' | 'visitor_emails', orderBy: string, page: number, limit: number): Promise<AnalyticsTableResponse<any>> {
    this.loggerService.log(`analyticsTable {helper} table=${table} page=${page} limit=${limit}`);
    const offset = (page - 1) * limit;
    const [rows, [totals]] = await Promise.all([
      this.postgresService.query<any>(`
        SELECT *
        FROM ${table}
        ORDER BY ${orderBy}
        LIMIT $1 OFFSET $2;
      `, [limit, offset]),
      this.postgresService.query<{ total: number }>(`
        SELECT COUNT(*)::int AS total FROM ${table};
      `)
    ]);
    return {
      rows,
      total: Number(totals?.total ?? 0),
      page,
      limit
    };
  }
}
