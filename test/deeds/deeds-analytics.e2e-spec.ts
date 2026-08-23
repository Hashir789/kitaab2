import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('DeedsController (e2e) - GET /deeds/analytics', () => {
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

  describe('type=deeds_table', () => {
    it('GET /deeds/analytics?type=deeds_table -> 200 with paginated deed item details', async () => {
      const deedItemRow = {
        deed_item_id: 1,
        deed_id: 5,
        parent_deed_item_id: null,
        display_order: 0,
        hide_type: 'none',
        created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      };
      postgresQueryMock
        .mockResolvedValueOnce([deedItemRow])
        .mockResolvedValueOnce([{ total: 1 }]);

      const response = await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'deeds_table', page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toEqual({
        rows: [deedItemRow],
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(postgresQueryMock).toHaveBeenCalledTimes(2);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM deed_items\b/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/deed_item_id, deed_id, parent_deed_item_id, display_order, hide_type, created_at/);
      expect(postgresQueryMock.mock.calls[0][0]).not.toMatch(/\bname\b/);
      expect(postgresQueryMock.mock.calls[0][0]).not.toMatch(/\bdescription\b/);
      expect(postgresQueryMock.mock.calls[0][0]).not.toMatch(/FROM deeds\b/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([10, 0]);
    });

    it('GET /deeds/analytics?type=deeds_table -> 200 with default page and limit', async () => {
      postgresQueryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const response = await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'deeds_table' })
        .expect(200);

      expect(response.body).toEqual({ rows: [], total: 0, page: 1, limit: 20 });
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([20, 0]);
    });
  });

  describe('type=users_association', () => {
    it('GET /deeds/analytics?type=users_association -> 200 with associated user details', async () => {
      const userRow = {
        id: 7,
        visitor_id: 3,
        gender: 'male',
        dob: '1995-05-10',
        email_verified: true,
        two_factor_enabled: false,
        last_login_at: new Date('2026-02-01T00:00:00.000Z').toISOString(),
        created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      };
      postgresQueryMock.mockResolvedValueOnce([userRow]);

      const response = await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'users_association', id: 1 })
        .expect(200);

      expect(response.body).toEqual({ id: 1, details: [userRow] });
      expect(postgresQueryMock).toHaveBeenCalledTimes(1);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM users u/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/JOIN deeds d ON d\.user_id = u\.id/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/JOIN deed_items di ON di\.deed_id = d\.deed_id/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/WHERE di\.deed_item_id = \$1/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([1]);
    });

    it('GET /deeds/analytics?type=users_association -> 400 when id missing', async () => {
      await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'users_association' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });
  });

  describe('type=visitors_association', () => {
    it('GET /deeds/analytics?type=visitors_association -> 200 with associated visitor details', async () => {
      const visitorRow = {
        id: 3,
        anonymous_id: 'anon-abc',
        timezone: 'Asia/Karachi',
        device_type: 'desktop',
        clicks: 5,
        navigations: 2,
        number_of_visits: 4,
        last_visited: new Date('2026-02-15T00:00:00.000Z').toISOString(),
      };
      postgresQueryMock.mockResolvedValueOnce([visitorRow]);

      const response = await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'visitors_association', id: 1 })
        .expect(200);

      expect(response.body).toEqual({ id: 1, details: [visitorRow] });
      expect(postgresQueryMock).toHaveBeenCalledTimes(1);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM visitors v/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/JOIN users u ON u\.visitor_id = v\.id/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/JOIN deeds d ON d\.user_id = u\.id/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/JOIN deed_items di ON di\.deed_id = d\.deed_id/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/WHERE di\.deed_item_id = \$1/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([1]);
    });

    it('GET /deeds/analytics?type=visitors_association -> 400 when id missing', async () => {
      await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'visitors_association' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });
  });

  describe('type=parent_deed_association', () => {
    it('GET /deeds/analytics?type=parent_deed_association -> 200 with parent deed item details', async () => {
      const parentRow = {
        deed_item_id: 2,
        deed_id: 5,
        parent_deed_item_id: null,
        display_order: 0,
        hide_type: 'none',
        created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      };
      postgresQueryMock.mockResolvedValueOnce([parentRow]);

      const response = await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'parent_deed_association', id: 1 })
        .expect(200);

      expect(response.body).toEqual({ id: 1, details: [parentRow] });
      expect(postgresQueryMock).toHaveBeenCalledTimes(1);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/FROM deed_items child/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/JOIN deed_items parent ON parent\.deed_item_id = child\.parent_deed_item_id/);
      expect(postgresQueryMock.mock.calls[0][0]).toMatch(/WHERE child\.deed_item_id = \$1/);
      expect(postgresQueryMock.mock.calls[0][0]).not.toMatch(/\bname\b/);
      expect(postgresQueryMock.mock.calls[0][1]).toEqual([1]);
    });

    it('GET /deeds/analytics?type=parent_deed_association -> 400 when id missing', async () => {
      await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'parent_deed_association' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('GET /deeds/analytics -> 400 when type missing', async () => {
      await request(app.getHttpServer())
        .get('/deeds/analytics')
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('GET /deeds/analytics -> 400 when type invalid', async () => {
      await request(app.getHttpServer())
        .get('/deeds/analytics')
        .query({ type: 'users_table' })
        .expect(400);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });
  });
});