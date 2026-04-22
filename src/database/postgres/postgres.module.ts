import { Module, Global } from '@nestjs/common';
import { PostgresService } from './postgres.service';

@Global()
@Module({
  exports: [PostgresService],
  providers: [PostgresService]
})

export class PostgresModule {}