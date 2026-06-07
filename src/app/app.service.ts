import { Logger } from '../logger/logger.service';
import { RedisService } from '../database/redis/redis.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { CheckDatabaseConnectionsResponseInterface, DailyReportResponseInterface } from './app.interface';

@Injectable()
export class AppService {
  
  constructor(
    private readonly loggerService: Logger,
    private readonly redisService: RedisService,
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

  dailyReport(): DailyReportResponseInterface {
    try {
      this.loggerService.log('dailyReport {controller}');
      return {
        visitors: {
          new_visitors: 120,
          returning_visitors: 45,
          total_visitors: 210,
          clicks: 9273,
          navigations: 847,
          visitor_emails: 34,
          visitor_messages: 9,
          timezones: {
            'Aisa/Karachi': 65,
            'Europe/London': 100
          }
        },
        users: {
          new_users: 32,
          returning_users: 26,
          total_users: 68,
          male: 23,
          female: 35,
          age: {
            '18': 30,
            '20': 25,
            '25': 3
          }
        },
        conversion: 2
      };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Helper functions
  
  private async tryPostgres(): Promise<void> {
    this.loggerService.log('tryPostgres {helper}');
    await this.postgresService.ping();
  }
  
  private async tryRedis(): Promise<void> {
    this.loggerService.log('tryRedis {helper}');
    await this.redisService.ping();
  }
}