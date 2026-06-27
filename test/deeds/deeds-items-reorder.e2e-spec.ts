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
import { TransactionClient } from '../../src/database/postgres/postgres.interface';

describe('DeedsController (e2e) - PATCH /deeds/:category/items/display-order', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const postgresTransactionMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const configGetMock = jest.fn();

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

    postgresTransactionMock.mockImplementation(async (callback: (client: TransactionClient) => Promise<unknown>) =>
      callback({ query: postgresQueryMock }),
    );

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

  it('-> 401, not 500, when Authorization header missing', async () => {
    const response = await request(app.getHttpServer())
      .patch('/deeds/hasanaat/items/display-order')
      .send({ display_order: [13, 23] })
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when payload invalid', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .patch('/deeds/hasanaat/items/display-order')
      .set('Authorization', 'Bearer access-token')
      .send({ display_order: [] })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when category invalid', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .patch('/deeds/invalid/items/display-order')
      .set('Authorization', 'Bearer access-token')
      .send({ display_order: [13, 23] })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when duplicate ids in display_order', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .patch('/deeds/hasanaat/items/display-order')
      .set('Authorization', 'Bearer access-token')
      .send({ display_order: [13, 13] })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 404, not 500, when deed category not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock.mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .patch('/deeds/hasanaat/items/display-order')
      .set('Authorization', 'Bearer access-token')
      .send({ display_order: [13, 23] })
      .expect(404);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('-> 404, not 500, when one or more level-1 deed items not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_id: 5 }])
      .mockResolvedValueOnce([{ deed_item_id: 13 }]);

    const response = await request(app.getHttpServer())
      .patch('/deeds/hasanaat/items/display-order')
      .set('Authorization', 'Bearer access-token')
      .send({ display_order: [13, 23] })
      .expect(404);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('-> 204 reorders level-1 deed items on happy path', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_id: 5 }])
      .mockResolvedValueOnce([
        { deed_item_id: 13 },
        { deed_item_id: 23 },
      ])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .patch('/deeds/hasanaat/items/display-order')
      .set('Authorization', 'Bearer access-token')
      .send({ display_order: [23, 13] })
      .expect(204);

    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(3);
    expect(postgresQueryMock.mock.calls[2][0]).toMatch(
      /SET display_order = array_position\(\$2::bigint\[\], di\.deed_item_id\)/,
    );
    expect(postgresQueryMock.mock.calls[2][0]).not.toMatch(/array_position.*- 1/);
    expect(postgresQueryMock.mock.calls[2][1]).toEqual([5, [23, 13], undefined]);
  });
});
