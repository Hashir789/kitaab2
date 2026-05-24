import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('VisitorsController (e2e) - GET /visitors/analytics', () => {
  let app: INestApplication<App>;
  const postgresQueryMock = jest.fn();

  beforeEach(async () => {
    postgresQueryMock.mockReset();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PostgresService)
      .useValue({
        query: postgresQueryMock,
        ping: jest.fn(),
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  describe('type=summary', () => {
    it('GET /visitors/analytics?type=summary -> 200 with totals, device_distribution and timezones', async () => {
      postgresQueryMock
        .mockResolvedValueOnce([
          { clicks: 12, navigations: 7, visitors: 3, visits: 9 },
        ])
        .mockResolvedValueOnce([
          { device_type: 'desktop', count: 2 },
          { device_type: 'mobile', count: 1 },
        ])
        .mockResolvedValueOnce([
          { timezone: 'Asia/Karachi', count: 2 },
          { timezone: 'UTC', count: 1 },
        ]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'summary' })
        .expect(200);

      expect(response.body).toEqual({
        summary: { clicks: 12, navigations: 7, visitors: 3, visits: 9 },
        device_distribution: [
          { device_type: 'desktop', count: 2 },
          { device_type: 'mobile', count: 1 },
        ],
        timezones: [
          { timezone: 'Asia/Karachi', count: 2 },
          { timezone: 'UTC', count: 1 },
        ],
      });
      expect(postgresQueryMock).toHaveBeenCalledTimes(3);
    });

    it('GET /visitors/analytics?type=summary -> 200 with zero defaults when database empty', async () => {
      postgresQueryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'summary' })
        .expect(200);

      expect(response.body).toEqual({
        summary: { clicks: 0, navigations: 0, visitors: 0, visits: 0 },
        device_distribution: [],
        timezones: [],
      });
    });
  });

  describe('type=*_association', () => {
    it('GET /visitors/analytics?type=users_association -> 200 with user details', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z').toISOString();
      const lastLoginAt = new Date('2026-02-01T00:00:00.000Z').toISOString();
      postgresQueryMock.mockResolvedValueOnce([
        {
          id: 1,
          gender: 'male',
          dob: '1995-05-10',
          email_verified: true,
          two_factor_enabled: false,
          last_login_at: lastLoginAt,
          created_at: createdAt,
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'users_association', anonymous_id: 'anon_123' })
        .expect(200);

      expect(response.body).toEqual({
        anonymous_id: 'anon_123',
        details: [
          {
            id: 1,
            gender: 'male',
            dob: '1995-05-10',
            email_verified: true,
            two_factor_enabled: false,
            last_login_at: lastLoginAt,
            created_at: createdAt,
          },
        ],
      });
      expect(postgresQueryMock).toHaveBeenCalledTimes(1);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM users t/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual(['anon_123']);
    });

    it('GET /visitors/analytics?type=messages_association -> 200 with message details', async () => {
      postgresQueryMock.mockResolvedValueOnce([
        {
          id: 10,
          name: 'Muhammad',
          email: 'muhammad@example.com',
          subject: 'Hello',
          phone: '+92-300-0000000',
          message: 'A long enough message.',
          created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'messages_association', anonymous_id: 'anon_123' })
        .expect(200);

      expect(response.body.anonymous_id).toBe('anon_123');
      expect(response.body.details).toHaveLength(1);
      expect(response.body.details[0]).toEqual(
        expect.objectContaining({
          id: 10,
          name: 'Muhammad',
          email: 'muhammad@example.com',
          subject: 'Hello',
          phone: '+92-300-0000000',
          message: 'A long enough message.',
        }),
      );
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM visitor_messages t/);
    });

    it('GET /visitors/analytics?type=emails_association -> 200 with email details', async () => {
      postgresQueryMock.mockResolvedValueOnce([
        {
          id: 5,
          email: 'visitor@example.com',
          created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'emails_association', anonymous_id: 'anon_123' })
        .expect(200);

      expect(response.body.anonymous_id).toBe('anon_123');
      expect(response.body.details[0]).toEqual(
        expect.objectContaining({ id: 5, email: 'visitor@example.com' }),
      );
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM visitor_emails t/);
    });

    it('GET /visitors/analytics association -> 200 with empty details when visitor has none', async () => {
      postgresQueryMock.mockResolvedValueOnce([]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'users_association', anonymous_id: 'anon_unknown' })
        .expect(200);

      expect(response.body).toEqual({ anonymous_id: 'anon_unknown', details: [] });
    });

    it('GET /visitors/analytics association -> 400 when anonymous_id missing', async () => {
      await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'users_association' })
        .expect(400);

      expect(postgresQueryMock).not.toHaveBeenCalled();
    });
  });

  describe('type=*_table', () => {
    it('GET /visitors/analytics?type=visitors_table -> 200 with paginated rows', async () => {
      const visitorRow = {
        id: 1,
        anonymous_id: 'anon_123',
        timezone: 'Asia/Karachi',
        device_type: 'desktop',
        clicks: 5,
        navigations: 3,
        number_of_visits: 2,
      };
      postgresQueryMock
        .mockResolvedValueOnce([visitorRow])
        .mockResolvedValueOnce([{ total: 1 }]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'visitors_table', page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toEqual({
        rows: [visitorRow],
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(postgresQueryMock).toHaveBeenCalledTimes(2);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM visitors\b/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([10, 0]);
    });

    it('GET /visitors/analytics?type=visitor_messages_table -> 200 with paginated rows', async () => {
      postgresQueryMock
        .mockResolvedValueOnce([{ id: 1, name: 'Muhammad' }])
        .mockResolvedValueOnce([{ total: 25 }]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'visitor_messages_table', page: 2, limit: 5 })
        .expect(200);

      expect(response.body).toEqual({
        rows: [{ id: 1, name: 'Muhammad' }],
        total: 25,
        page: 2,
        limit: 5,
      });
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM visitor_messages\b/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([5, 5]);
    });

    it('GET /visitors/analytics?type=visitor_emails_table -> 200 with default page and limit', async () => {
      postgresQueryMock
        .mockResolvedValueOnce([{ id: 1, email: 'visitor@example.com' }])
        .mockResolvedValueOnce([{ total: 1 }]);

      const response = await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'visitor_emails_table' })
        .expect(200);

      expect(response.body).toEqual({
        rows: [{ id: 1, email: 'visitor@example.com' }],
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM visitor_emails\b/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([20, 0]);
    });
  });

  describe('validation', () => {
    it('GET /visitors/analytics -> 400 when type missing', async () => {
      await request(app.getHttpServer())
        .get('/visitors/analytics')
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /visitors/analytics -> 400 when type invalid', async () => {
      await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'nonsense' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /visitors/analytics -> 400 when page is not a positive integer', async () => {
      await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'visitors_table', page: 0, limit: 10 })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /visitors/analytics -> 400 when limit exceeds maximum', async () => {
      await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'visitors_table', page: 1, limit: 500 })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /visitors/analytics -> 400 when unknown query param sent', async () => {
      await request(app.getHttpServer())
        .get('/visitors/analytics')
        .query({ type: 'summary', extra: 'nope' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });
  });
});
