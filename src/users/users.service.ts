import { UserAnalyticsDto } from './users.dto';
import { Logger } from '../logger/logger.service';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { AgeDistributionResponse, GenderRatioResponse, MeQueryInterface, MeResult, UserTableResponse, UserTableRow, VisitorAssociationRow, VisitorsAssociationResponse } from './users.interface';

@Injectable()
export class UsersService {

  constructor(
    private readonly loggerService: Logger,
    private readonly postgresService: PostgresService
  ) {}

  // controller functions

  async getMe(req: AuthenticatedRequest): Promise<MeResult> {
    try {
      this.loggerService.log('getMe {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      const rows = await this.postgresService.query<MeQueryInterface>(`
        SELECT id, email, full_name, gender, dob, key_salt, key_iv, encrypted_master_key, created_at
        FROM users WHERE id = $1
      `, [user_id]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { id, email, full_name, gender, dob, key_salt, key_iv, encrypted_master_key, created_at } = rows[0];
      return { id, email, full_name, gender, dob, key_salt, key_iv, encrypted_master_key, created_at };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async userAnalytics(query: UserAnalyticsDto): Promise<UserTableResponse | GenderRatioResponse | AgeDistributionResponse | VisitorsAssociationResponse> {
    try {
      this.loggerService.log('userAnalytics {controller}');
      const { type, id, page = 1, limit = 20 } = query;
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
        if (!id) {
          this.loggerService.error('id is required for visitors_association', HttpStatus.BAD_REQUEST);
          throw new HttpException('id is required for visitors_association', HttpStatus.BAD_REQUEST);
        }
        const rows = await this.postgresService.query<VisitorAssociationRow>(`
          SELECT id, anonymous_id, timezone, device_type, clicks, navigations, number_of_visits, last_visited
          FROM visitors
          WHERE id = $1;
        `, [id]);
        return { id, details: rows };
      }
      this.loggerService.error('Invalid user analytics type', HttpStatus.BAD_REQUEST);
      throw new HttpException('Invalid user analytics type', HttpStatus.BAD_REQUEST);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}