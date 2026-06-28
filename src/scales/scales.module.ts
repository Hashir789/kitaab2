import { Module } from '@nestjs/common';
import { ScalesService } from './scales.service';
import { ScalesController } from './scales.controller';

@Module({
  providers: [ScalesService],
  controllers: [ScalesController]
})

export class ScalesModule {}
