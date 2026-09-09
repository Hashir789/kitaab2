import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '../../src/logger/logger.service';
import { JwtAuthGuard } from '../../src/auth/auth.guard';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('RecordsController (e2e) - GET /records/range', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  const startDate = '2026-09-01';
  const endDate = '2026-09-30';

  const accessTokenPayload = {
    sub: 1,
    email: 'muhammad@example.com',
    type: 'access',
    email_verified: true,
  };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    configGetMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, string> = {
        JWT_PUBLIC_KEY: 'test-public',
      };
      return table[key];
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PostgresService)
      .useValue({
        query: postgresQueryMock,
        transaction: jest.fn(),
        ping: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({
        set: jest.fn(),
        get: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(),
      })
      .overrideProvider(JwtService)
      .useValue({
        signAsync: jest.fn(),
        verifyAsync: jwtVerifyAsyncMock,
      })
      .overrideProvider(ConfigService)
      .useValue({
        get: configGetMock,
      })
      .overrideProvider(EncryptionService)
      .useValue({
        hmacEmail: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const logger = app.get(Logger);
    app.useGlobalGuards(
      new JwtAuthGuard(logger, app.get(JwtService), app.get(ConfigService)),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('-> 401 when Authorization header missing', async () => {
    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=${startDate}&end_date=${endDate}`)
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when token invalid', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=${startDate}&end_date=${endDate}`)
      .set('Authorization', 'Bearer bad-token')
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when start_date is invalid', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=not-a-date&end_date=${endDate}`)
      .set('Authorization', 'Bearer access-token')
      .expect(400);

    expect(response.status).not.toBe(500);
  });

  it('-> 400 when end_date is invalid', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=${startDate}&end_date=invalid`)
      .set('Authorization', 'Bearer access-token')
      .expect(400);

    expect(response.status).not.toBe(500);
  });

  it('-> 400 when start_date is greater than end_date', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=2026-10-01&end_date=2026-09-01`)
      .set('Authorization', 'Bearer access-token')
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(response.body.message).toContain('start_date must not be greater than end_date');
  });

  it('-> 200 returns scale deeds with sub-deeds aggregating counts and percentages', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const deedRows = [
      {
        deed_item_id: 10,
        parent_deed_item_id: null,
        name: 'Namaz',
        display_order: 1,
        type: 'scale',
        scale_items_id: 1,
        scale_item_name: 'Missed',
        scale_item_display_order: 1,
      },
      {
        deed_item_id: 10,
        parent_deed_item_id: null,
        name: 'Namaz',
        display_order: 1,
        type: 'scale',
        scale_items_id: 2,
        scale_item_name: 'Late',
        scale_item_display_order: 2,
      },
      {
        deed_item_id: 10,
        parent_deed_item_id: null,
        name: 'Namaz',
        display_order: 1,
        type: 'scale',
        scale_items_id: 3,
        scale_item_name: 'In Time',
        scale_item_display_order: 3,
      },
      {
        deed_item_id: 10,
        parent_deed_item_id: null,
        name: 'Namaz',
        display_order: 1,
        type: 'scale',
        scale_items_id: 4,
        scale_item_name: 'In Mosque',
        scale_item_display_order: 4,
      },
      {
        deed_item_id: 11,
        parent_deed_item_id: 10,
        name: 'Fajr',
        display_order: 1,
        type: 'scale',
        scale_items_id: 1,
        scale_item_name: 'Missed',
        scale_item_display_order: 1,
      },
      {
        deed_item_id: 11,
        parent_deed_item_id: 10,
        name: 'Fajr',
        display_order: 1,
        type: 'scale',
        scale_items_id: 2,
        scale_item_name: 'Late',
        scale_item_display_order: 2,
      },
      {
        deed_item_id: 11,
        parent_deed_item_id: 10,
        name: 'Fajr',
        display_order: 1,
        type: 'scale',
        scale_items_id: 3,
        scale_item_name: 'In Time',
        scale_item_display_order: 3,
      },
      {
        deed_item_id: 11,
        parent_deed_item_id: 10,
        name: 'Fajr',
        display_order: 1,
        type: 'scale',
        scale_items_id: 4,
        scale_item_name: 'In Mosque',
        scale_item_display_order: 4,
      },
      {
        deed_item_id: 12,
        parent_deed_item_id: 10,
        name: 'Zuhr',
        display_order: 2,
        type: 'scale',
        scale_items_id: 1,
        scale_item_name: 'Missed',
        scale_item_display_order: 1,
      },
      {
        deed_item_id: 12,
        parent_deed_item_id: 10,
        name: 'Zuhr',
        display_order: 2,
        type: 'scale',
        scale_items_id: 2,
        scale_item_name: 'Late',
        scale_item_display_order: 2,
      },
      {
        deed_item_id: 12,
        parent_deed_item_id: 10,
        name: 'Zuhr',
        display_order: 2,
        type: 'scale',
        scale_items_id: 3,
        scale_item_name: 'In Time',
        scale_item_display_order: 3,
      },
      {
        deed_item_id: 12,
        parent_deed_item_id: 10,
        name: 'Zuhr',
        display_order: 2,
        type: 'scale',
        scale_items_id: 4,
        scale_item_name: 'In Mosque',
        scale_item_display_order: 4,
      },
    ];

    const recordRows = [
      // Fajr records
      { deed_item_id: 11, date: '2026-09-01', scale_item_id: 1, count_value: null },
      { deed_item_id: 11, date: '2026-09-02', scale_item_id: 1, count_value: null },
      { deed_item_id: 11, date: '2026-09-03', scale_item_id: 2, count_value: null },
      { deed_item_id: 11, date: '2026-09-04', scale_item_id: 3, count_value: null },
      // Zuhr records
      { deed_item_id: 12, date: '2026-09-01', scale_item_id: 2, count_value: null },
      { deed_item_id: 12, date: '2026-09-02', scale_item_id: 4, count_value: null },
    ];

    postgresQueryMock
      .mockResolvedValueOnce(deedRows)
      .mockResolvedValueOnce(recordRows);

    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=${startDate}&end_date=${endDate}`)
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    expect(response.body).toEqual([
      {
        deed_item_id: 10,
        name: 'Namaz',
        type: 'scale',
        total: 6,
        scales: [
          { scale_item_id: 1, name: 'Missed', count: 2, percentage: 33.33 },
          { scale_item_id: 2, name: 'Late', count: 2, percentage: 33.33 },
          { scale_item_id: 3, name: 'In Time', count: 1, percentage: 16.67 },
          { scale_item_id: 4, name: 'In Mosque', count: 1, percentage: 16.67 },
        ],
        daily_counts: null,
        children: [
          {
            deed_item_id: 11,
            name: 'Fajr',
            type: 'scale',
            total: 4,
            scales: [
              { scale_item_id: 1, name: 'Missed', count: 2, percentage: 50 },
              { scale_item_id: 2, name: 'Late', count: 1, percentage: 25 },
              { scale_item_id: 3, name: 'In Time', count: 1, percentage: 25 },
              { scale_item_id: 4, name: 'In Mosque', count: 0, percentage: 0 },
            ],
            daily_counts: null,
          },
          {
            deed_item_id: 12,
            name: 'Zuhr',
            type: 'scale',
            total: 2,
            scales: [
              { scale_item_id: 1, name: 'Missed', count: 0, percentage: 0 },
              { scale_item_id: 2, name: 'Late', count: 1, percentage: 50 },
              { scale_item_id: 3, name: 'In Time', count: 0, percentage: 0 },
              { scale_item_id: 4, name: 'In Mosque', count: 1, percentage: 50 },
            ],
            daily_counts: null,
          },
        ],
      },
    ]);
  });

  it('-> 200 returns count deeds with daily_counts aggregated by date', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const deedRows = [
      {
        deed_item_id: 20,
        parent_deed_item_id: null,
        name: 'Dhikr',
        display_order: 1,
        type: 'count',
        scale_items_id: null,
        scale_item_name: null,
        scale_item_display_order: null,
      },
      {
        deed_item_id: 21,
        parent_deed_item_id: 20,
        name: 'SubhanAllah',
        display_order: 1,
        type: 'count',
        scale_items_id: null,
        scale_item_name: null,
        scale_item_display_order: null,
      },
      {
        deed_item_id: 22,
        parent_deed_item_id: 20,
        name: 'Alhamdulillah',
        display_order: 2,
        type: 'count',
        scale_items_id: null,
        scale_item_name: null,
        scale_item_display_order: null,
      },
    ];

    const recordRows = [
      { deed_item_id: 21, date: '2026-09-01', scale_item_id: null, count_value: 100 },
      { deed_item_id: 22, date: '2026-09-01', scale_item_id: null, count_value: 134 },
      { deed_item_id: 22, date: '2026-09-02', scale_item_id: null, count_value: 345 },
    ];

    postgresQueryMock
      .mockResolvedValueOnce(deedRows)
      .mockResolvedValueOnce(recordRows);

    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=${startDate}&end_date=${endDate}`)
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    expect(response.body).toEqual([
      {
        deed_item_id: 20,
        name: 'Dhikr',
        type: 'count',
        total: 579,
        scales: null,
        daily_counts: [
          { date: '2026-09-01', count: 234 },
          { date: '2026-09-02', count: 345 },
        ],
        children: [
          {
            deed_item_id: 21,
            name: 'SubhanAllah',
            type: 'count',
            total: 100,
            scales: null,
            daily_counts: [
              { date: '2026-09-01', count: 100 },
            ],
          },
          {
            deed_item_id: 22,
            name: 'Alhamdulillah',
            type: 'count',
            total: 479,
            scales: null,
            daily_counts: [
              { date: '2026-09-01', count: 134 },
              { date: '2026-09-02', count: 345 },
            ],
          },
        ],
      },
    ]);
  });

  it('-> 200 returns zero counts for unrecorded deeds', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const deedRows = [
      {
        deed_item_id: 30,
        parent_deed_item_id: null,
        name: 'Unrecorded Count Deed',
        display_order: 1,
        type: 'count',
        scale_items_id: null,
        scale_item_name: null,
        scale_item_display_order: null,
      },
    ];

    postgresQueryMock
      .mockResolvedValueOnce(deedRows)
      .mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .get(`/records/range?start_date=${startDate}&end_date=${endDate}`)
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    expect(response.body).toEqual([
      {
        deed_item_id: 30,
        name: 'Unrecorded Count Deed',
        type: 'count',
        total: 0,
        scales: null,
        daily_counts: [],
      },
    ]);
  });
});
