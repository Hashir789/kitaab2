import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { DeedsModule } from '../deeds/deeds.module';
import { ScalesModule } from '../scales/scales.module';
import { LoggerModule } from '../logger/logger.module';
import { RecordsModule } from '../records/records.module';
import { RedisModule } from '../database/redis/redis.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config';
import { PostgresModule } from '../database/postgres/postgres.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    } as ConfigModuleOptions),
    AuthModule,
    EmailModule,
    RedisModule,
    UsersModule,
    DeedsModule,
    ScalesModule,
    LoggerModule,
    RecordsModule,
    PostgresModule,
    VisitorsModule
  ],
  providers: [AppService],
  controllers: [AppController]
})

export class AppModule { }