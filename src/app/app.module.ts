import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../logger/logger.module';
import { RedisModule } from '../database/redis/redis.module';
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config';
import { PostgresModule } from '../database/postgres/postgres.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    } as ConfigModuleOptions),
    AuthModule,
    LoggerModule,
    PostgresModule,
    RedisModule
  ],
  controllers: [AppController],
  providers: [AppService]
})

export class AppModule {}