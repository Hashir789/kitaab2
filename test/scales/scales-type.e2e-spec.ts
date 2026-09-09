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

describe('ScalesController (e2e) - Scale Status and Type', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const postgresTransactionMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  const deedItemId = 10;

  const accessTokenPayload = {
    sub: 1,
    email: 'muhammad@example.com',
    type: 'access',
    email_verified: true,
  };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    postgresTransactionMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    configGetMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, string> = {
        JWT_PUBLIC_KEY: 'test-public',
      };
      return table[key];
    });

    postgresTransactionMock.mockImplementation(async (cb: (client: any) => Promise<any>) => {
      return cb({ query: postgresQueryMock });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PostgresService)
      .useValue({
        query: postgresQueryMock,
        transaction: postgresTransactionMock,
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

  describe('GET /scales/:deed_item_id', () => {
    it('-> 401 when Authorization header missing', async () => {
      const response = await request(app.getHttpServer())
        .get(`/scales/${deedItemId}`)
        .expect(401);

      expect(response.status).not.toBe(500);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('-> 401 when token invalid', async () => {
      jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

      const response = await request(app.getHttpServer())
        .get(`/scales/${deedItemId}`)
        .set('Authorization', 'Bearer bad-token')
        .expect(401);

      expect(response.status).not.toBe(500);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('-> 400 when deed_item_id is not numeric', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

      const response = await request(app.getHttpServer())
        .get('/scales/not-a-number')
        .set('Authorization', 'Bearer access-token')
        .expect(400);

      expect(response.status).not.toBe(500);
      expect(postgresQueryMock).not.toHaveBeenCalled();
    });

    it('-> 400 when deed item is a child deed item', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
      postgresQueryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ deed_item_id: deedItemId }]);

      const response = await request(app.getHttpServer())
        .get(`/scales/${deedItemId}`)
        .set('Authorization', 'Bearer access-token')
        .expect(400);

      expect(response.status).not.toBe(500);
    });

    it('-> 404 when root deed item not found', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
      postgresQueryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const response = await request(app.getHttpServer())
        .get(`/scales/${deedItemId}`)
        .set('Authorization', 'Bearer access-token')
        .expect(404);

      expect(response.status).not.toBe(500);
    });

    it('-> 200 returns type: scale and is_locked: true when records exist', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
      postgresQueryMock
        .mockResolvedValueOnce([{ deed_item_id: deedItemId, type: 'scale' }])
        .mockResolvedValueOnce([{ is_locked: true }]);

      const response = await request(app.getHttpServer())
        .get(`/scales/${deedItemId}`)
        .set('Authorization', 'Bearer access-token')
        .expect(200);

      expect(response.body).toEqual({
        type: 'scale',
        is_locked: true,
      });
    });

    it('-> 200 returns type: null and is_locked: false when no records exist', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
      postgresQueryMock
        .mockResolvedValueOnce([{ deed_item_id: deedItemId, type: null }])
        .mockResolvedValueOnce([{ is_locked: false }]);

      const response = await request(app.getHttpServer())
        .get(`/scales/${deedItemId}`)
        .set('Authorization', 'Bearer access-token')
        .expect(200);

      expect(response.body).toEqual({
        type: null,
        is_locked: false,
      });
    });
  });

  describe('POST /scales/:deed_item_id/type', () => {
    it('-> 401 when Authorization header missing', async () => {
      const response = await request(app.getHttpServer())
        .post(`/scales/${deedItemId}/type`)
        .send({ type: 'scale' })
        .expect(401);

      expect(response.status).not.toBe(500);
    });

    it('-> 400 when type is invalid', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

      const response = await request(app.getHttpServer())
        .post(`/scales/${deedItemId}/type`)
        .set('Authorization', 'Bearer access-token')
        .send({ type: 'invalid_type' })
        .expect(400);

      expect(response.status).not.toBe(500);
    });

    it('-> 400 when deed is locked due to existing records', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
      postgresQueryMock
        .mockResolvedValueOnce([{ deed_item_id: deedItemId }])
        .mockResolvedValueOnce([{ is_locked: true }]);

      const response = await request(app.getHttpServer())
        .post(`/scales/${deedItemId}/type`)
        .set('Authorization', 'Bearer access-token')
        .send({ type: 'count' })
        .expect(400);

      expect(response.status).not.toBe(500);
      expect(response.body.message).toContain('existing records');
    });

    it('-> 204 sets deed type successfully when deed is unlocked', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
      postgresQueryMock
        .mockResolvedValueOnce([{ deed_item_id: deedItemId }])
        .mockResolvedValueOnce([{ is_locked: false }])
        .mockResolvedValueOnce([]);

      await request(app.getHttpServer())
        .post(`/scales/${deedItemId}/type`)
        .set('Authorization', 'Bearer access-token')
        .send({ type: 'scale' })
        .expect(204);

      expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
      const [updateSql, updateParams] = postgresQueryMock.mock.calls[2];
      expect(updateSql).toContain('UPDATE deed_items');
      expect(updateParams).toEqual(['scale', deedItemId]);
    });
  });
});
