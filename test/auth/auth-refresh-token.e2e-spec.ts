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

describe('AuthController (e2e) - POST /auth/refresh-token', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const configGetMock = jest.fn();
  const hmacEmailMock = jest.fn();

  const accessUser = {
    sub: 1,
    email: 'muhammad@example.com',
    type: 'access',
    email_verified: false,
  };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    jwtSignAsyncMock.mockReset();
    configGetMock.mockReset();
    hmacEmailMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        JWT_PUBLIC_KEY: 'test-public',
        JWT_PRIVATE_KEY: 'test-private',
        ACCESS_TOKEN_EXPIRATION_TIME: '1h',
      };
      return table[key];
    });

    hmacEmailMock.mockReturnValue('email-hmac');

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
      .overrideProvider(EncryptionService)
      .useValue({
        hmacEmail: hmacEmailMock,
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
    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .expect(401);

    expect(jwtVerifyAsyncMock).not.toHaveBeenCalled();
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when Authorization header malformed', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Token abc')
      .expect(401);

    expect(jwtVerifyAsyncMock).not.toHaveBeenCalled();
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when token invalid or expired', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer bad-token')
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when token type is not access', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({ ...accessUser, type: 'refresh' });

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer refresh-token')
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when user not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer access-token')
      .expect(401);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when select returns undefined', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer access-token')
      .expect(401);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when select throws', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer access-token')
      .expect(500);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when jwt sign throws', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: true }]);
    jwtSignAsyncMock.mockRejectedValueOnce(new Error('jwt boom'));

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer access-token')
      .expect(500);
  });

  it('-> 200 returns new access_token reflecting current email_verified=true', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: true }]);
    jwtSignAsyncMock.mockResolvedValueOnce('new-access-token');

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ access_token: 'new-access-token' });
      });

    expect(hmacEmailMock).toHaveBeenCalledWith(accessUser.email);
    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = postgresQueryMock.mock.calls[0];
    expect(sql).toMatch(/SELECT email_verified FROM users/);
    expect(params).toEqual([accessUser.sub, 'email-hmac']);

    expect(jwtSignAsyncMock).toHaveBeenCalledTimes(1);
    expect(jwtSignAsyncMock).toHaveBeenCalledWith({
      sub: accessUser.sub,
      email: accessUser.email,
      type: 'access',
      email_verified: true,
    });
  });

  it('-> 200 returns new access_token reflecting current email_verified=false', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: false }]);
    jwtSignAsyncMock.mockResolvedValueOnce('new-access-token');

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ access_token: 'new-access-token' });
      });

    expect(jwtSignAsyncMock).toHaveBeenCalledWith({
      sub: accessUser.sub,
      email: accessUser.email,
      type: 'access',
      email_verified: false,
    });
  });

  it('-> 200 verifies token with RS256 and configured public key', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: true }]);
    jwtSignAsyncMock.mockResolvedValueOnce('new-access-token');

    await request(app.getHttpServer())
      .post('/auth/refresh-token')
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    expect(jwtVerifyAsyncMock).toHaveBeenCalledWith('access-token', {
      publicKey: 'test-public',
      algorithms: ['RS256'],
    });
  });
});
