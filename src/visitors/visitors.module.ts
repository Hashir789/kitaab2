import { Module } from '@nestjs/common';
import { VisitorService } from './visitors.service';
import { VisitorsController } from './visitors.controller';

@Module({
  providers: [VisitorService],
  controllers: [VisitorsController]
})

export class VisitorsModule {}