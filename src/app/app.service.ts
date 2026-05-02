import { Logger } from '../logger/logger.service';
import { Injectable, HttpException } from '@nestjs/common';
import { RedisService } from '../database/redis/redis.service';
import { PostgresService } from '../database/postgres/postgres.service';
import { CheckDatabaseConnectionsResponseInterface } from './interface/CheckDatabaseConnections.interface';

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
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
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
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
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