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
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('AuthController (e2e) - PATCH /auth/2fa', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  const accessUser = {
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
      const table: Record<string, any> = {
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
      .patch('/auth/2fa')
      .send({ two_factor_enabled: true })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when Authorization header malformed', async () => {
    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Token abc')
      .send({ two_factor_enabled: true })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 (not 500) when token invalid', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer bad-token')
      .send({ two_factor_enabled: true })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when token type is not access (guard)', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({ ...accessUser, type: 'refresh' });

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer refresh-token')
      .send({ two_factor_enabled: true })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 403 when email not verified (guard)', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({ ...accessUser, email_verified: false });

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(403);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload missing two_factor_enabled', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({})
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when two_factor_enabled wrong type', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: 'true' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true, admin: true })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when user not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      ...accessUser,
      sub: 999,
      email: 'missing@example.com',
    });
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(401);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
  });

  it('-> 401 when select returns null/undefined', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(401);
  });

  it('-> 403 when DB row says email not verified', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: false }]);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(403);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
  });

  it('-> 401 when update returns no rows (race)', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock
      .mockResolvedValueOnce([{ email_verified: true }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(401);

    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('-> 500 mapped when select throws', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(500);
  });

  it('-> 500 mapped when update throws', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock
      .mockResolvedValueOnce([{ email_verified: true }])
      .mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(500);
  });

  it('-> 204 when email verified and update succeeds', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce(accessUser);
    postgresQueryMock
      .mockResolvedValueOnce([{ email_verified: true }])
      .mockResolvedValueOnce([{ two_factor_enabled: true }]);

    await request(app.getHttpServer())
      .patch('/auth/2fa')
      .set('Authorization', 'Bearer access-token')
      .send({ two_factor_enabled: true })
      .expect(204)
      .expect('');

    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });
});
