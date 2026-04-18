import { Logger } from '../logger/logger.service';
import { Injectable, HttpException } from '@nestjs/common';
import { RedisService } from '../database/redis/redis.service';
import { PostgresService } from '../database/postgres/postgres.service';

@Injectable()
export class AppService {

  constructor(
    private readonly loggerService: Logger,
    private readonly redisService: RedisService,
    private readonly postgresService: PostgresService
  ) {}
  
  healthCheck() {
    this.loggerService.log('healthCheck {controller}');
  }
  
  async checkDatabaseConnections(): Promise<{ data: { postgres: boolean; redis: boolean; }; statusCode: number; }> {
    try {
      this.loggerService.log('checkDatabaseConnections {controller}');
      const [postgres, redis] = await Promise.allSettled([ this.tryPostgres(), this.tryRedis() ]);
      return {
        data: {
          postgres: postgres.status === 'fulfilled',
          redis: redis.status === 'fulfilled',
        },
        statusCode: 200
      };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
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