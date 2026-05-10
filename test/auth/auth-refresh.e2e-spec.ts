import request from 'supertest';
import { App } from 'supertest/types';
import { createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('AuthController (e2e) - POST /auth/refresh', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  const incomingRefreshJwt = 'incoming-refresh-jwt';
  const incomingRefreshHash = createHash('sha256').update(incomingRefreshJwt).digest('hex');

  const userRow = {
    id: 1,
    email: 'muhammad@example.com',
    email_verified: true,
    refresh_token_hash: incomingRefreshHash,
  };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    jwtSignAsyncMock.mockReset();
    configGetMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        JWT_PUBLIC_KEY: 'test-public',
        JWT_PRIVATE_KEY: 'test-private',
        REFRESH_TOKEN_EXPIRATION_TIME: '7d',
        ACCESS_TOKEN_EXPIRATION_TIME: '1h',
      };
      return table[key];
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PostgresService)
      .useValue({
        query: postgresQueryMock,
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
        signAsync: jwtSignAsyncMock,
        verifyAsync: jwtVerifyAsyncMock,
      })
      .overrideProvider(ConfigService)
      .useValue({
        get: configGetMock,
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

  it('-> 400 when payload empty', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(400);

    expect(jwtVerifyAsyncMock).not.toHaveBeenCalled();
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt, admin: true })
      .expect(400);

    expect(jwtVerifyAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when JWT verify fails', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt })
      .expect(401);

    expect(res.body.message).toBe('Invalid or expired token');
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when token type is not refresh', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: userRow.id,
      email: userRow.email,
      type: 'access',
    });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt })
      .expect(401);

    expect(res.body.message).toBe('Invalid token type');
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when user not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: userRow.id,
      email: userRow.email,
      type: 'refresh',
    });
    postgresQueryMock.mockResolvedValueOnce([]);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt })
      .expect(401);

    expect(res.body.message).toBe('User not found');
  });

  it('-> 401 when refresh_token_hash mismatch', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: userRow.id,
      email: userRow.email,
      type: 'refresh',
    });
    postgresQueryMock.mockResolvedValueOnce([
      {
        ...userRow,
        refresh_token_hash: 'wrong-hash',
      },
    ]);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt })
      .expect(401);

    expect(res.body.message).toBe('Invalid or expired token');
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when stored refresh_token_hash is null', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: userRow.id,
      email: userRow.email,
      type: 'refresh',
    });
    postgresQueryMock.mockResolvedValueOnce([
      {
        ...userRow,
        refresh_token_hash: null,
      },
    ]);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt })
      .expect(401);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 200 returns new access_token on happy path', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: userRow.id,
      email: userRow.email,
      type: 'refresh',
    });
    postgresQueryMock.mockResolvedValueOnce([userRow]).mockResolvedValueOnce([]);
    jwtSignAsyncMock.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ access_token: 'new-access-token' });
      });

    expect(jwtSignAsyncMock).toHaveBeenCalledTimes(2);
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('-> 500 mapped when postgres query throws', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: userRow.id,
      email: userRow.email,
      type: 'refresh',
    });
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: incomingRefreshJwt })
      .expect(500);
  });
});