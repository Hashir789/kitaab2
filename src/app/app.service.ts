import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../database/redis/redis.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { CheckDatabaseConnectionsResponseInterface, DailyReportResponseInterface } from './app.interface';

@Injectable()
export class AppService {

  private readonly reportKeys = [
    'report:new_users',
    'report:returning_users',
    'report:new_visitors',
    'report:returning_visitors',
    'report:clicks',
    'report:navigations',
    'report:emails',
    'report:messages',
    'report:gender',
    'report:ages',
    'report:timezones',
    'report:device_types'
  ];

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

  async dailyReport(): Promise<void> {
    try {
      this.loggerService.log('dailyReport {controller}');
      const [ new_users, returning_users, new_visitors, returning_visitors, clicks, navigations, visitor_emails, visitor_messages, new_deeds, gender, age, timezones, device_types, deed_categories ] = await Promise.all([
        this.readCounter('report:new_users'),
        this.readCounter('report:returning_users'),
        this.readCounter('report:new_visitors'),
        this.readCounter('report:returning_visitors'),
        this.readCounter('report:clicks'),
        this.readCounter('report:navigations'),
        this.readCounter('report:emails'),
        this.readCounter('report:messages'),
        this.readCounter('report:new_deeds'),
        this.redisService.getHash('report:gender'),
        this.redisService.getHash('report:ages'),
        this.redisService.getHash('report:timezones'),
        this.redisService.getHash('report:device_types'),
        this.redisService.getHash('report:deed_categories')
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
          timezones,
          device_types
        },
        users: {
          new_users,
          returning_users,
          total_users,
          male: gender.male ?? 0,
          female: gender.female ?? 0,
          age
        },
        deeds: {
          new_deeds: new_deeds ?? 0,
          hasanaat: deed_categories.hasanaat ?? 0,
          saiyyiaat: deed_categories.saiyyiaat ?? 0
        },
        conversion: new_visitors > 0 ? Math.round((new_users / new_visitors) * 100) : 0
      };
      const { visitors, users, conversion, deeds } = report;
      await this.emailService.sendDailyReportEmail({
        email: this.configService.get<string>('DAILY_REPORT_RECIPIENT') ?? '',
        date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()),
        visitors,
        users: {
          ...users,
          age: Object.fromEntries(
            Object.entries(report.users.age).map(([years, count]) => [`${years} years`, count])
          )
        },
        deeds,
        conversion
      });
      await Promise.all(this.reportKeys.map((key) => this.redisService.del(key)));
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