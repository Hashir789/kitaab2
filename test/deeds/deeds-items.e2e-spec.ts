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

describe('DeedsController (e2e) - POST /deeds/:category/items', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const postgresTransactionMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  const validPayload = {
    name: 'Daily prayer',
    description: 'Track daily prayer',
    display_order: 1,
    hide_type: 'none',
  };

  const accessTokenPayload = {
    sub: 1,
    email: 'muhammad@example.com',
    type: 'access',
    email_verified: true,
  };

  const createdDeedItem = {
    deed_item_id: 10,
    deed_id: 5,
    parent_deed_item_id: null,
    name: validPayload.name,
    description: validPayload.description,
    display_order: validPayload.display_order,
    hide_type: validPayload.hide_type,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
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
        incrementInHash: jest.fn(async () => 1),
        incrementBy: jest.fn(async () => undefined)
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
      .post('/deeds/hasanaat/items')
      .send(validPayload)
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 401, not 500, when token invalid', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    const response = await request(app.getHttpServer())
      .post('/deeds/hasanaat/items')
      .set('Authorization', 'Bearer bad-token')
      .send(validPayload)
      .expect(401);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when payload invalid', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .post('/deeds/hasanaat/items')
      .set('Authorization', 'Bearer access-token')
      .send({
        name: '',
        display_order: -1,
        hide_type: 'invalid',
      })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 400, not 500, when category invalid', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .post('/deeds/invalid/items')
      .set('Authorization', 'Bearer access-token')
      .send(validPayload)
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 404, not 500, when deed category not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock.mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .post('/deeds/hasanaat/items')
      .set('Authorization', 'Bearer access-token')
      .send(validPayload)
      .expect(404);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('-> 404, not 500, when parent deed item not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_id: 5 }])
      .mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .post('/deeds/hasanaat/items')
      .set('Authorization', 'Bearer access-token')
      .send({
        ...validPayload,
        parent_deed_item_id: 999,
      })
      .expect(404);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('-> 400, not 500, when nested children include parent_deed_item_id', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);

    const response = await request(app.getHttpServer())
      .post('/deeds/hasanaat/items')
      .set('Authorization', 'Bearer access-token')
      .send({
        ...validPayload,
        children: [
          {
            name: 'Nested child',
            parent_deed_item_id: 10,
          },
        ],
      })
      .expect(400);

    expect(response.status).not.toBe(500);
    expect(postgresTransactionMock).not.toHaveBeenCalled();
  });

  it('-> 204 creates a deed item on happy path', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_id: 5 }])
      .mockResolvedValueOnce([createdDeedItem]);

    await request(app.getHttpServer())
      .post('/deeds/hasanaat/items')
      .set('Authorization', 'Bearer access-token')
      .send(validPayload)
      .expect(204);

    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('-> 204 creates nested deed items on happy path', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessTokenPayload);
    postgresQueryMock
      .mockResolvedValueOnce([{ deed_id: 5 }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/deeds/hasanaat/items')
      .set('Authorization', 'Bearer access-token')
      .send({
        name: 'Example Deed',
        display_order: 21,
        hide_type: 'none',
        children: [
          {
            name: 'Fajar',
            display_order: 1,
            children: [
              {
                name: 'Farz',
                display_order: 1,
              },
            ],
          },
        ],
      })
      .expect(204);

    expect(postgresTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);

    const [, bulkInsertParams] = postgresQueryMock.mock.calls[1];
    expect(bulkInsertParams).toEqual(
      expect.arrayContaining([
        5,
        null,
        'Example Deed',
        null,
        21,
        'none',
        [0],
        ['Fajar'],
        [null],
        [1],
        ['none'],
        [1],
        [0],
        ['Farz'],
        [null],
        [1],
        ['none'],
        [2],
      ]),
    );
  });
});