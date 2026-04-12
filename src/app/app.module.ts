import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/logger/logger.module';
import { RedisModule } from 'src/database/redis/redis.module';
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config';
import { PostgresModule } from 'src/database/postgres/postgres.module';

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