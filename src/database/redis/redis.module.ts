import { RedisService } from './redis.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  exports: [RedisService],
  providers: [RedisService]
})

export class RedisModule {}