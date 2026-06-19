import { Module } from '@nestjs/common';
import { DeedsService } from './deeds.service';
import { DeedsController } from './deeds.controller';

@Module({
  providers: [DeedsService],
  controllers: [DeedsController]
})

export class DeedsModule {}