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

describe('ScalesController (e2e) - POST /scales/:deed_item_id/items', () => {
  let app: INestApplication<App>;

  const configGetMock = jest.fn();
  const postgresQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const postgresTransactionMock = jest.fn();

  const deedItemId = 10;

  const validPayload = {
    items: [
      {
        name: 'Level 1',
        display_order: 1,
        description: 'First scale level',
      },
    ],
  };

  const accessTokenPayload = {
    sub: 1,
    type: 'access',
    email_verified: true,
    email: 'muhammad@example.com',
  };

  beforeEach(async () => {
    configGetMock.mockReset();
    postgresQueryMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    postgresTransactionMock.mockReset();

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
        incrementInHash: jest.fn(async () => 1),
        incrementBy: jest.fn(async () => undefined),
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
      .post(`/scales/${deedItemId}/items`)
      .send(validPayload)
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 401, not 500, when token invalid', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    const response = await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer bad-token')
      .send(validPayload)
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 401, not 500, when token type is not access', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      ...accessTokenPayload,
      type: 'refresh',
    });

    const response = await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer refresh-token')
      .send(validPayload)
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when payload invalid', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send({
        items: [
          {
            name: '',
            display_order: -1,
          },
        ],
      })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when items array is empty', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send({ items: [] })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when payload contains unknown fields', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send({
        items: [
          {
            ...validPayload.items[0],
            hide_type: 'none',
          },
        ],
      })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when deed_item_id is not numeric', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .post('/scales/not-a-number/items')
      .set('Authorization', 'Bearer access-token')
      .send(validPayload)
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 404, not 500, when root deed item not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send(validPayload)
      .expect(404);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('-> 400, not 500, when deed item is not a root item', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ deed_item_id: deedItemId }]);

    const response = await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send(validPayload)
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('-> 204 creates a scale item on happy path', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_item_id: deedItemId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ scale_id: 3 }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send(validPayload)
      .expect(204);

    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(4);

    const [, rootDeedLookupParams] = postgresQueryMock.mock.calls[0];
    expect(rootDeedLookupParams).toEqual([deedItemId, 1]);

    const [, scaleLookupParams] = postgresQueryMock.mock.calls[1];
    expect(scaleLookupParams).toEqual([deedItemId]);

    const [, scaleInsertParams] = postgresQueryMock.mock.calls[2];
    expect(scaleInsertParams).toEqual([deedItemId]);

    const [, insertParams] = postgresQueryMock.mock.calls[3];
    expect(insertParams).toEqual([
      3,
      [validPayload.items[0].name],
      [validPayload.items[0].description],
      [validPayload.items[0].display_order],
    ]);
  });

  it('-> 204 creates a scale item when scale already exists', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_item_id: deedItemId }])
      .mockResolvedValueOnce([{ scale_id: 7 }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send({
        items: [
          {
            name: 'Level 2',
            display_order: 0,
          },
        ],
      })
      .expect(204);

    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(3);

    const [, scaleLookupParams] = postgresQueryMock.mock.calls[1];
    expect(scaleLookupParams).toEqual([deedItemId]);

    const [, insertParams] = postgresQueryMock.mock.calls[2];
    expect(insertParams).toEqual([7, ['Level 2'], [null], [0]]);
  });

  it('-> 204 defaults display_order to 0 when omitted', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_item_id: deedItemId }])
      .mockResolvedValueOnce([{ scale_id: 3 }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send({
        items: [
          {
            name: 'Level 1',
          },
        ],
      })
      .expect(204);

    expect(postgresQueryMock).toHaveBeenCalledTimes(3);

    const [, insertParams] = postgresQueryMock.mock.calls[2];
    expect(insertParams).toEqual([3, ['Level 1'], [null], [0]]);
  });

  it('-> 204 creates multiple scale items in one request', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_item_id: deedItemId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ scale_id: 3 }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post(`/scales/${deedItemId}/items`)
      .set('Authorization', 'Bearer access-token')
      .send({
        items: [
          {
            name: 'Yes',
            description: 'Completed / positive',
            display_order: 0,
          },
          {
            name: 'No',
            description: 'Not completed / negative',
            display_order: 1,
          },
        ],
      })
      .expect(204);

    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(4);

    const [, insertParams] = postgresQueryMock.mock.calls[3];
    expect(insertParams).toEqual([
      3,
      ['Yes', 'No'],
      ['Completed / positive', 'Not completed / negative'],
      [0, 1],
    ]);
  });
});
