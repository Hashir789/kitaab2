import { RedisService } from './redis.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService]
})

export class RedisModule {}