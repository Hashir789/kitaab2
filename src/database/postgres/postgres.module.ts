import { Module, Global } from '@nestjs/common';
import { PostgresService } from './postgres.service';

@Global()
@Module({
  providers: [PostgresService],
  exports: [PostgresService],
})

export class PostgresModule {}