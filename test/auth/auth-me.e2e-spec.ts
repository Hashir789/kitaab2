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

describe('AuthController (e2e) - GET /auth/me', () => {
  let app: INestApplication<App>;

  const redisGetMock = jest.fn();
  const redisDelMock = jest.fn();
  const postgresQueryMock = jest.fn();
  const configGetMock = jest.fn();

  const userEmail = 'muhammad@example.com';

  const cachedSession = {
    dob: '2000-01-01',
    email: userEmail,
    gender: 'male',
    full_name: 'Muhammad Hashir',
    created_at: '2026-01-01T00:00:00.000Z',
    two_factor_enabled: false,
    access_token: 'access-token',
  };

  beforeEach(async () => {
    redisGetMock.mockReset();
    redisDelMock.mockReset();
    postgresQueryMock.mockReset();
    configGetMock.mockReset();

    postgresQueryMock.mockResolvedValue([]);

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        JWT_PUBLIC_KEY: 'test-public',
        PASSWORD_PEPPER: 'pepper',
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
        get: redisGetMock,
        del: redisDelMock,
        ping: jest.fn(),
      })
      .overrideProvider(JwtService)
      .useValue({
        signAsync: jest.fn(),
        verifyAsync: jest.fn(),
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

  it('-> 400 when email query param missing', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(redisGetMock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email is not a valid email', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ email: 'not-an-email' })
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 404 when redis returns null (session expired)', async () => {
    redisGetMock.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ email: userEmail })
      .expect(404);

    expect(redisGetMock).toHaveBeenCalledWith(expect.stringMatching(/^user:.+\..+$/));
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 404 when redis returns undefined', async () => {
    redisGetMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ email: userEmail })
      .expect(404);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.get throws', async () => {
    redisGetMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ email: userEmail })
      .expect(500);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when stored value is corrupted JSON', async () => {
    redisGetMock.mockResolvedValueOnce('not-json{');

    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ email: userEmail })
      .expect(500);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 200 returns cached session when stored as JSON string', async () => {
    redisGetMock.mockResolvedValueOnce(JSON.stringify(cachedSession));

    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ email: userEmail })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(cachedSession);
      });

    expect(redisGetMock).toHaveBeenCalledTimes(1);
    const redisSessionKey = redisGetMock.mock.calls[0][0];
    expect(redisSessionKey).toMatch(/^user:.+\..+$/);
    expect(redisDelMock).toHaveBeenCalledTimes(1);
    expect(redisDelMock).toHaveBeenCalledWith(redisSessionKey);
  });

  it('-> 200 returns cached session when stored as object (Upstash auto-parse)', async () => {
    redisGetMock.mockResolvedValueOnce(cachedSession);

    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ email: userEmail })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(cachedSession);
      });

    const redisSessionKey = redisGetMock.mock.calls[0][0];
    expect(redisSessionKey).toMatch(/^user:.+\..+$/);
    expect(redisDelMock).toHaveBeenCalledTimes(1);
    expect(redisDelMock).toHaveBeenCalledWith(redisSessionKey);
  });
});