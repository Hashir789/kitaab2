import { Redis } from '@upstash/redis';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../logger/logger.service';

@Injectable()
export class RedisService {
  private redis: Redis;
  
  constructor(private readonly configService: ConfigService, private readonly loggerService: Logger) {
    this.redis = new Redis({
      url: this.configService.get<string>('UPSTASH_REDIS_URL'),
      token: this.configService.get<string>('UPSTASH_REDIS_TOKEN')
    });
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.loggerService.log('set {query}');
    ttlSeconds = ttlSeconds || this.configService.get<number>('UPSTASH_REDIS_EXPIRATION_TIME') || 3600;
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async get(key: string): Promise<any> {
    this.loggerService.log('get {query}');
    return this.redis.get(key);
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}