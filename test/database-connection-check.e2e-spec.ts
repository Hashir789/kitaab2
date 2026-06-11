import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppService } from '../src/app/app.service';
import { Logger } from '../src/logger/logger.service';
import { JwtAuthGuard } from '../src/auth/auth.guard';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app/app.controller';
import { EmailService } from '../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../src/database/redis/redis.service';
import { PostgresService } from '../src/database/postgres/postgres.service';

type LoggerMock = Pick<Logger, 'log' | 'error' | 'warn' | 'debug' | 'verbose'>;

async function createTestApp(options?: {
  loggerLogImpl?: (message: string) => void;
  postgresPingImpl?: () => Promise<void>;
  redisPingImpl?: () => Promise<void>;
}): Promise<{
  app: INestApplication<App>;
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
      { provide: EmailService, useValue: { sendDailyReportEmail: jest.fn(async () => undefined) } },
      {
        provide: RedisService,
        useValue: {
          ping: jest.fn(options?.redisPingImpl ?? (async () => undefined)),
        },
      },
      {
        provide: PostgresService,
        useValue: {
          ping: jest.fn(options?.postgresPingImpl ?? (async () => undefined)),
        },
      },
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

  return { app };
}

describe('/database/connection-check (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET -> 200 { postgres: true, redis: true } when both pings succeed', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer())
      .get('/database/connection-check')
      .expect(200)
      .expect({ postgres: true, redis: true });
  });

  it('GET -> 200 { postgres: false, redis: true } when postgres ping fails', async () => {
    ({ app } = await createTestApp({
      postgresPingImpl: async () => {
        throw new Error('postgres down');
      },
    }));

    await request(app.getHttpServer())
      .get('/database/connection-check')
      .expect(200)
      .expect({ postgres: false, redis: true });
  });

  it('GET -> 200 { postgres: true, redis: false } when redis ping fails', async () => {
    ({ app } = await createTestApp({
      redisPingImpl: async () => {
        throw new Error('redis down');
      },
    }));

    await request(app.getHttpServer())
      .get('/database/connection-check')
      .expect(200)
      .expect({ postgres: true, redis: false });
  });

  it('GET -> 200 { postgres: false, redis: false } when both pings fail', async () => {
    ({ app } = await createTestApp({
      postgresPingImpl: async () => {
        throw new Error('postgres down');
      },
      redisPingImpl: async () => {
        throw new Error('redis down');
      },
    }));

    await request(app.getHttpServer())
      .get('/database/connection-check')
      .expect(200)
      .expect({ postgres: false, redis: false });
  });

  it('GET with query string -> 200 (excludedUrls check strips query)', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer())
      .get('/database/connection-check?foo=bar')
      .expect(200)
      .expect({ postgres: true, redis: true });
  });

  it('HEAD -> 200', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).head('/database/connection-check').expect(200);
  });

  it('POST -> 404', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).post('/database/connection-check').expect(404);
  });

  it('GET trailing slash -> 401 (not excluded by JwtAuthGuard)', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).get('/database/connection-check/').expect(401);
  });

  it('GET -> 500 when logger throws in AppService.checkDatabaseConnections()', async () => {
    ({ app } = await createTestApp({
      loggerLogImpl: (message: string) => {
        if (message.includes('checkDatabaseConnections {controller}')) {
          throw new Error('boom');
        }
      },
    }));

    const res = await request(app.getHttpServer()).get('/database/connection-check').expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'boom' });
  });
});