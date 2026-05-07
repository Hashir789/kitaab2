import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppService } from '../src/app/app.service';
import { Logger } from '../src/logger/logger.service';
import { JwtAuthGuard } from '../src/auth/auth.guard';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app/app.controller';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../src/database/redis/redis.service';
import { PostgresService } from '../src/database/postgres/postgres.service';

type LoggerMock = Pick<Logger, 'log' | 'error' | 'warn' | 'debug' | 'verbose'>;

async function createTestApp(options?: {
  loggerLogImpl?: (message: string) => void;
}): Promise<{
  app: INestApplication<App>;
  logger: LoggerMock;
}> {
  const logger: LoggerMock = {
    log: jest.fn(options?.loggerLogImpl ?? (() => undefined)),
    error: jest.fn(() => undefined),
    warn: jest.fn(() => undefined),
    debug: jest.fn(() => undefined),
    verbose: jest.fn(() => undefined),
  };

  const jwtService: Pick<JwtService, 'verifyAsync'> = {
    verifyAsync: jest.fn(async () => {
      return { sub: 'user', email: 'user@example.com', type: 'access' } as any;
    }),
  };

  const configService: Pick<ConfigService, 'get'> = {
    get: jest.fn(() => undefined),
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [AppController],
    providers: [
      AppService,
      { provide: Logger, useValue: logger },
      { provide: JwtService, useValue: jwtService },
      { provide: ConfigService, useValue: configService },
      { provide: RedisService, useValue: { ping: jest.fn(async () => undefined) } },
      { provide: PostgresService, useValue: { ping: jest.fn(async () => undefined) } },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalGuards(new JwtAuthGuard(logger as Logger, app.get(JwtService), app.get(ConfigService)));

  await app.init();

  return { app, logger };
}

describe('/health-check (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET -> 204 No Content (no auth required)', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).get('/health-check').expect(204).expect('');
  });

  it('GET with query string -> 204 (excludedUrls check strips query)', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).get('/health-check?foo=bar').expect(204).expect('');
  });

  it('HEAD -> 204', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).head('/health-check').expect(204);
  });

  it('POST -> 404', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).post('/health-check').expect(404);
  });

  it('GET trailing slash -> 401 (not excluded by JwtAuthGuard)', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).get('/health-check/').expect(401);
  });

  it('GET -> 500 when logger throws in AppService.healthCheck()', async () => {
    ({ app } = await createTestApp({
      loggerLogImpl: (message: string) => {
        if (message.includes('healthCheck {controller}')) {
          throw new Error('boom');
        }
      },
    }));

    const res = await request(app.getHttpServer()).get('/health-check').expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'boom' });
  });

  it('GET -> 500 when logger throws inside JwtAuthGuard.canActivate()', async () => {
    ({ app } = await createTestApp({
      loggerLogImpl: (message: string) => {
        if (message.includes('canActivate {guard}')) {
          throw new Error('guard broke');
        }
      },
    }));

    const res = await request(app.getHttpServer()).get('/health-check').expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
  });
});