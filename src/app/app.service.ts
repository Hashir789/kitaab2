import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../database/redis/redis.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { CheckDatabaseConnectionsResponseInterface, DailyReportResponseInterface } from './app.interface';

@Injectable()
export class AppService {
  
  constructor(
    private readonly loggerService: Logger,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly postgresService: PostgresService
  ) {}
  
  // Controller functions

  healthCheck() {
    try {
      this.loggerService.log('healthCheck {controller}');
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  
  async checkDatabaseConnections(): Promise<CheckDatabaseConnectionsResponseInterface> {
    try {
      this.loggerService.log('checkDatabaseConnections {controller}');
      const [postgres, redis] = await Promise.allSettled([ this.tryPostgres(), this.tryRedis() ]);
      return {
        redis: redis.status === 'fulfilled',
        postgres: postgres.status === 'fulfilled'
      };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async dailyReport(): Promise<DailyReportResponseInterface> {
    try {
      this.loggerService.log('dailyReport {controller}');
      const [
        new_users,
        returning_users,
        new_visitors,
        returning_visitors,
        clicks,
        navigations,
        visitor_emails,
        visitor_messages,
        gender,
        age,
        timezones
      ] = await Promise.all([
        this.readCounter('report:new_users'),
        this.readCounter('report:returning_users'),
        this.readCounter('report:new_visitors'),
        this.readCounter('report:returning_visitors'),
        this.readCounter('report:clicks'),
        this.readCounter('report:navigations'),
        this.readCounter('report:emails'),
        this.readCounter('report:messages'),
        this.redisService.getHash('report:gender'),
        this.redisService.getHash('report:ages'),
        this.redisService.getHash('report:timezones')
      ]);
      const total_users = new_users + returning_users;
      const total_visitors = new_visitors + returning_visitors;
      const report: DailyReportResponseInterface = {
        visitors: {
          new_visitors,
          returning_visitors,
          total_visitors,
          clicks,
          navigations,
          visitor_emails,
          visitor_messages,
          timezones
        },
        users: {
          new_users,
          returning_users,
          total_users,
          male: gender.male ?? 0,
          female: gender.female ?? 0,
          age
        },
        conversion: new_visitors > 0 ? Math.round((new_users / new_visitors) * 100) : 0
      };
      const { visitors, users, conversion } = report;
      this.emailService.sendDailyReportEmail({
        email: this.configService.get<string>('DAILY_REPORT_RECIPIENT') ?? '',
        date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()),
        visitors,
        users: {
          ...users,
          age: Object.fromEntries(
            Object.entries(report.users.age).map(([years, count]) => [`${years} years`, count])
          )
        },
        conversion
      }).catch((error) => this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR));
      return report;
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Helper functions

  private async readCounter(key: string): Promise<number> {
    this.loggerService.log('readCounter {helper}');
    const value = await this.redisService.get(key);
    return Number(value) || 0;
  }
  
  private async tryPostgres(): Promise<void> {
    this.loggerService.log('tryPostgres {helper}');
    await this.postgresService.ping();
  }
  
  private async tryRedis(): Promise<void> {
    this.loggerService.log('tryRedis {helper}');
    await this.redisService.ping();
  }
}