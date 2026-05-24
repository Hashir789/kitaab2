import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('UsersController (e2e) - GET /users/analytics', () => {
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

  describe('type=users_table', () => {
    it('GET /users/analytics?type=users_table -> 200 with paginated user details', async () => {
      const userRow = {
        id: 1,
        visitor_id: 7,
        gender: 'male',
        dob: '1995-05-10',
        email_verified: true,
        two_factor_enabled: false,
        last_login_at: new Date('2026-02-01T00:00:00.000Z').toISOString(),
        created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      };
      postgresQueryMock
        .mockResolvedValueOnce([userRow])
        .mockResolvedValueOnce([{ total: 1 }]);

      const response = await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'users_table', page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toEqual({
        rows: [userRow],
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(postgresQueryMock).toHaveBeenCalledTimes(2);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM users\b/);
      expect(postgresQueryMock.mock.calls[0][0]).not.toMatch(/password_hash|encrypted_master_key|full_name/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([10, 0]);
    });

    it('GET /users/analytics?type=users_table -> 200 with default page and limit', async () => {
      postgresQueryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const response = await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'users_table' })
        .expect(200);

      expect(response.body).toEqual({ rows: [], total: 0, page: 1, limit: 20 });
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([20, 0]);
    });

    it('GET /users/analytics?type=users_table -> 200 with non-default pagination offset math', async () => {
      postgresQueryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 100 }]);

      await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'users_table', page: 3, limit: 25 })
        .expect(200);

      expect(postgresQueryMock.mock.calls[0][1]).toEqual([25, 50]);
    });
  });

  describe('type=gender_ratio', () => {
    it('GET /users/analytics?type=gender_ratio -> 200 with counts and percentages', async () => {
      postgresQueryMock.mockResolvedValueOnce([
        { gender: 'male', count: 6 },
        { gender: 'female', count: 4 },
      ]);

      const response = await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'gender_ratio' })
        .expect(200);

      expect(response.body).toEqual({
        total: 10,
        distribution: [
          { gender: 'male', count: 6, percentage: 60 },
          { gender: 'female', count: 4, percentage: 40 },
        ],
      });
      expect(postgresQueryMock).toHaveBeenCalledTimes(1);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM users/);
    });

    it('GET /users/analytics?type=gender_ratio -> 200 with empty distribution when no users', async () => {
      postgresQueryMock.mockResolvedValueOnce([]);

      const response = await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'gender_ratio' })
        .expect(200);

      expect(response.body).toEqual({ total: 0, distribution: [] });
    });

    it('GET /users/analytics?type=gender_ratio -> 200 with three groups summing to 100%', async () => {
      postgresQueryMock.mockResolvedValueOnce([
        { gender: 'male', count: 3 },
        { gender: 'female', count: 3 },
        { gender: 'unknown', count: 4 },
      ]);

      const response = await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'gender_ratio' })
        .expect(200);

      expect(response.body.total).toBe(10);
      const totalPercentage = response.body.distribution.reduce(
        (sum: number, row: { percentage: number }) => sum + row.percentage,
        0,
      );
      expect(totalPercentage).toBe(100);
    });
  });

  describe('type=age_distribution', () => {
    it('GET /users/analytics?type=age_distribution -> 200 with per-age counts ordered ascending', async () => {
      postgresQueryMock.mockResolvedValueOnce([
        { age: 22, count: 1 },
        { age: 25, count: 3 },
        { age: 30, count: 2 },
        { age: 41, count: 4 },
      ]);

      const response = await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'age_distribution' })
        .expect(200);

      expect(response.body).toEqual({
        total: 10,
        distribution: [
          { age: 22, count: 1 },
          { age: 25, count: 3 },
          { age: 30, count: 2 },
          { age: 41, count: 4 },
        ],
      });
      expect(postgresQueryMock).toHaveBeenCalledTimes(1);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM users/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/age\(dob\)/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/GROUP BY age/);
    });

    it('GET /users/analytics?type=age_distribution -> 200 with empty distribution when no users with dob', async () => {
      postgresQueryMock.mockResolvedValueOnce([]);

      const response = await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'age_distribution' })
        .expect(200);

      expect(response.body).toEqual({ total: 0, distribution: [] });
    });
  });

  describe('validation', () => {
    it('GET /users/analytics -> 400 when type missing', async () => {
      await request(app.getHttpServer())
        .get('/users/analytics')
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /users/analytics -> 400 when type invalid', async () => {
      await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'summary' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /users/analytics -> 400 when page is not a positive integer', async () => {
      await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'users_table', page: 0, limit: 10 })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /users/analytics -> 400 when limit exceeds maximum', async () => {
      await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'users_table', page: 1, limit: 500 })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /users/analytics -> 400 when unknown query param sent', async () => {
      await request(app.getHttpServer())
        .get('/users/analytics')
        .query({ type: 'gender_ratio', extra: 'nope' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });
  });
});