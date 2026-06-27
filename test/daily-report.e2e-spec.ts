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

const reportKeys = [
  'report:new_users',
  'report:returning_users',
  'report:new_visitors',
  'report:returning_visitors',
  'report:clicks',
  'report:navigations',
  'report:emails',
  'report:messages',
  'report:gender',
  'report:ages',
  'report:timezones',
  'report:device_types',
];

async function createTestApp(options?: {
  loggerLogImpl?: (message: string) => void;
  redisGetImpl?: (key: string) => Promise<string | null>;
  redisGetHashImpl?: (key: string) => Promise<Record<string, number>>;
  sendDailyReportEmailImpl?: (...args: unknown[]) => Promise<void>;
  configGetImpl?: (key: string) => unknown;
}): Promise<{
  app: INestApplication<App>;
  sendDailyReportEmail: jest.Mock;
  redisDel: jest.Mock;
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

  const sendDailyReportEmail = jest.fn(options?.sendDailyReportEmailImpl ?? (async () => undefined));
  const redisDel = jest.fn(async () => undefined);

  const configService: Pick<ConfigService, 'get'> = {
    get: jest.fn((key: string) => {
      if (options?.configGetImpl) {
        return options.configGetImpl(key);
      }
      if (key === 'DAILY_REPORT_RECIPIENT') {
        return 'reports@example.com';
      }
      return undefined;
    }),
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [AppController],
    providers: [
      AppService,
      { provide: Logger, useValue: logger },
      { provide: JwtService, useValue: jwtService },
      { provide: ConfigService, useValue: configService },
      { provide: EmailService, useValue: { sendDailyReportEmail } },
      {
        provide: RedisService,
        useValue: {
          ping: jest.fn(async () => undefined),
          get: jest.fn(options?.redisGetImpl ?? (async () => null)),
          getHash: jest.fn(options?.redisGetHashImpl ?? (async () => ({}))),
          del: redisDel,
        },
      },
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

  return { app, sendDailyReportEmail, redisDel };
}

describe('/daily-report (e2e)', () => {
  let app: INestApplication<App>;
  let sendDailyReportEmail: jest.Mock;
  let redisDel: jest.Mock;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET -> 204 No Content (no auth required)', async () => {
    ({ app, sendDailyReportEmail } = await createTestApp());

    await request(app.getHttpServer()).get('/daily-report').expect(204).expect('');
    expect(sendDailyReportEmail).toHaveBeenCalledTimes(1);
  });

  it('GET -> sends daily report email with visitor, user, deed and conversion data', async () => {
    ({ app, sendDailyReportEmail } = await createTestApp({
      redisGetImpl: async (key: string) => {
        const counters: Record<string, string> = {
          'report:new_users': '4',
          'report:returning_users': '6',
          'report:new_visitors': '10',
          'report:returning_visitors': '5',
          'report:clicks': '20',
          'report:navigations': '8',
          'report:emails': '2',
          'report:messages': '1',
          'report:new_deeds': '3',
        };
        return counters[key] ?? null;
      },
      redisGetHashImpl: async (key: string) => {
        const hashes: Record<string, Record<string, number>> = {
          'report:gender': { male: 5, female: 5 },
          'report:ages': { '25': 3, '30': 2 },
          'report:timezones': { 'Asia/Karachi': 4 },
          'report:device_types': { desktop: 6, mobile: 4 },
          'report:deed_categories': { hasanaat: 7, saiyyiaat: 2 },
        };
        return hashes[key] ?? {};
      },
    }));

    await request(app.getHttpServer()).get('/daily-report').expect(204);

    expect(sendDailyReportEmail).toHaveBeenCalledTimes(1);
    const payload = sendDailyReportEmail.mock.calls[0][0];
    expect(payload.email).toBe('reports@example.com');
    expect(payload.visitors).toEqual({
      new_visitors: 10,
      returning_visitors: 5,
      total_visitors: 15,
      clicks: 20,
      navigations: 8,
      visitor_emails: 2,
      visitor_messages: 1,
      timezones: { 'Asia/Karachi': 4 },
      device_types: { desktop: 6, mobile: 4 },
    });
    expect(payload.users).toEqual({
      new_users: 4,
      returning_users: 6,
      total_users: 10,
      male: 5,
      female: 5,
      age: { '25 years': 3, '30 years': 2 },
    });
    expect(payload.deeds).toEqual({
      new_deeds: 3,
      hasanaat: 7,
      saiyyiaat: 2,
    });
    expect(payload.conversion).toBe(40);
  });

  it('GET -> defaults missing redis counters and deed categories to zero', async () => {
    ({ app, sendDailyReportEmail } = await createTestApp());

    await request(app.getHttpServer()).get('/daily-report').expect(204);

    const payload = sendDailyReportEmail.mock.calls[0][0];
    expect(payload.visitors).toEqual({
      new_visitors: 0,
      returning_visitors: 0,
      total_visitors: 0,
      clicks: 0,
      navigations: 0,
      visitor_emails: 0,
      visitor_messages: 0,
      timezones: {},
      device_types: {},
    });
    expect(payload.users).toEqual({
      new_users: 0,
      returning_users: 0,
      total_users: 0,
      male: 0,
      female: 0,
      age: {},
    });
    expect(payload.deeds).toEqual({
      new_deeds: 0,
      hasanaat: 0,
      saiyyiaat: 0,
    });
    expect(payload.conversion).toBe(0);
  });

  it('GET -> clears report redis keys after sending email', async () => {
    ({ app, redisDel } = await createTestApp());

    await request(app.getHttpServer()).get('/daily-report').expect(204);

    expect(redisDel).toHaveBeenCalledTimes(reportKeys.length);
    for (const key of reportKeys) {
      expect(redisDel).toHaveBeenCalledWith(key);
    }
  });

  it('GET with query string -> 204 (excludedUrls check strips query)', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).get('/daily-report?foo=bar').expect(204).expect('');
  });

  it('HEAD -> 204', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).head('/daily-report').expect(204);
  });

  it('POST -> 404', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).post('/daily-report').expect(404);
  });

  it('GET trailing slash -> 401 (not excluded by JwtAuthGuard)', async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer()).get('/daily-report/').expect(401);
  });

  it('GET -> 500 when sendDailyReportEmail throws', async () => {
    ({ app } = await createTestApp({
      sendDailyReportEmailImpl: async () => {
        throw new Error('smtp down');
      },
    }));

    const res = await request(app.getHttpServer()).get('/daily-report').expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'smtp down' });
  });

  it('GET -> 500 when logger throws in AppService.dailyReport()', async () => {
    ({ app } = await createTestApp({
      loggerLogImpl: (message: string) => {
        if (message.includes('dailyReport {controller}')) {
          throw new Error('boom');
        }
      },
    }));

    const res = await request(app.getHttpServer()).get('/daily-report').expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'boom' });
  });
});