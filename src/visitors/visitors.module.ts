import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { VisitorService } from './visitors.service';
import { VisitorsController } from './visitors.controller';

@Module({
  imports: [EmailModule],
  providers: [VisitorService],
  controllers: [VisitorsController]
})

export class VisitorsModule {}