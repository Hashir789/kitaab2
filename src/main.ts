import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from './logger/logger.service';
import { JwtAuthGuard } from './auth/auth.guard';
import { INestApplication, ValidationPipe } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule, { logger: false });
  const logger: Logger = app.get<Logger>(Logger);
  app.useLogger(logger);
  const configService: ConfigService = app.get<ConfigService>(ConfigService);
  if (configService.get<string>('TRUST_PROXY') === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  const port: number = configService.get<number>('PORT') ?? 3000;
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    }),
  );
  app.useGlobalGuards( new JwtAuthGuard(app.get(JwtService), app.get(ConfigService), logger) );
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.listen(port);
}

bootstrap();