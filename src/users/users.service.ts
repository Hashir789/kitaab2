import { UserAnalyticsDto } from './users.dto';
import { Logger } from '../logger/logger.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { AgeDistributionResponse, GenderRatioResponse, UserTableResponse, UserTableRow, VisitorAssociationRow, VisitorsAssociationResponse } from './users.interface';

@Injectable()
export class UsersService {

  constructor(
    private readonly loggerService: Logger,
    private readonly postgresService: PostgresService
  ) {}

  // controller functions

  async userAnalytics(query: UserAnalyticsDto): Promise<UserTableResponse | GenderRatioResponse | AgeDistributionResponse | VisitorsAssociationResponse> {
    try {
      this.loggerService.log('userAnalytics {controller}');
      const { type, anonymous_id, page = 1, limit = 20 } = query;
      if (type === 'users_table') {
        const offset = (page - 1) * limit;
        const [rows, [totals]] = await Promise.all([
          this.postgresService.query<UserTableRow>(`
            SELECT id, visitor_id, gender, dob, email_verified, two_factor_enabled, last_login_at, created_at
            FROM users
            ORDER BY created_at DESC, id DESC
            LIMIT $1 OFFSET $2;
          `, [limit, offset]),
          this.postgresService.query<{ total: number }>(`
            SELECT COUNT(*)::int AS total FROM users;
          `)
        ]);
        return { rows, total: Number(totals?.total ?? 0), page, limit };
      }
      if (type === 'gender_ratio') {
        const rows = await this.postgresService.query<{ gender: string; count: number }>(`
          SELECT COALESCE(gender, 'unknown') AS gender, COUNT(*)::int AS count
          FROM users
          GROUP BY COALESCE(gender, 'unknown')
          ORDER BY count DESC, gender ASC;
        `);
        const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
        return {
          total,
          distribution: rows.map((row) => ({
            gender: row.gender,
            count: Number(row.count),
            percentage: total === 0 ? 0 : Number(((Number(row.count) / total) * 100).toFixed(2))
          }))
        };
      }
      if (type === 'age_distribution') {
        const rows = await this.postgresService.query<{ age: number; count: number }>(`
          SELECT EXTRACT(YEAR FROM age(dob))::int AS age, COUNT(*)::int AS count
          FROM users
          WHERE dob IS NOT NULL
          GROUP BY age
          ORDER BY age ASC;
        `);
        const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
        return {
          total,
          distribution: rows.map((row) => ({ age: Number(row.age), count: Number(row.count) }))
        };
      }
      if (type === 'visitors_association') {
        if (!anonymous_id) {
          this.loggerService.error('anonymous_id is required for visitors_association', HttpStatus.BAD_REQUEST);
          throw new HttpException('anonymous_id is required for visitors_association', HttpStatus.BAD_REQUEST);
        }
        const rows = await this.postgresService.query<VisitorAssociationRow>(`
          SELECT v.id, v.anonymous_id, v.timezone, v.device_type, v.clicks, v.navigations, v.number_of_visits, v.last_visited
          FROM visitors v
          JOIN users u ON u.visitor_id = v.id
          WHERE v.anonymous_id = $1
          ORDER BY v.id ASC;
        `, [anonymous_id]);
        return { anonymous_id, details: rows };
      }
      this.loggerService.error('Invalid user analytics type', HttpStatus.BAD_REQUEST);
      throw new HttpException('Invalid user analytics type', HttpStatus.BAD_REQUEST);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}