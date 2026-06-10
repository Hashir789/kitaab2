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

  async incrementBy(key: string, increment: number): Promise<void> {
    this.loggerService.log('incrementBy {query}');
    await this.redis.incrby(key, increment);
  }

  async incrementInHash(key: string, field: string, increment: number): Promise<number> {
    this.loggerService.log('incrementInHash {query}');
    return this.redis.hincrby(key, field, increment);
  }

  async get(key: string): Promise<any> {
    this.loggerService.log('get {query}');
    return this.redis.get(key);
  }

  async getHash(key: string): Promise<Record<string, number>> {
    this.loggerService.log('getHash {query}');
    const hash = await this.redis.hgetall<Record<string, unknown>>(key);
    if (!hash) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(hash).map(([field, value]) => [field, Number(value) || 0])
    );
  }

  async del(key: string): Promise<number> {
    this.loggerService.log('del {query}');
    return this.redis.del(key);
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}