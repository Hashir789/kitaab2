import request from 'supertest';
import { createHash } from 'crypto';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { hash } from 'bcrypt';

describe('AuthController (e2e) - POST /auth/signup', () => {
  let app: INestApplication<App>;

  const redisSetMock = jest.fn();
  const configGetMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const postgresQueryMock = jest.fn();
  const sendOtpVerificationEmailMock = jest.fn();

  const validPayload = {
    anonymous_id: 'anon_123',
    full_name: 'Muhammad Hashir',
    email: 'muhammad@example.com',
    password: 'password123',
    gender: 'male',
    dob: '2000-01-01',
  };

  const userRow = {
    id: 1,
    full_name: 'Muhammad Hashir',
    email: 'muhammad@example.com',
    gender: 'male',
    dob: '2000-01-01',
    two_factor_enabled: false,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    email_verified: false,
  };

  beforeEach(async () => {
    redisSetMock.mockReset();
    configGetMock.mockReset();
    jwtSignAsyncMock.mockReset();
    postgresQueryMock.mockReset();
    sendOtpVerificationEmailMock.mockReset();
    (hash as unknown as jest.Mock).mockReset();
    (hash as unknown as jest.Mock).mockResolvedValue('hashed-password');

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
        OTP_EXPIRES_IN_MINUTES: '15',
        ACCESS_TOKEN_EXPIRATION_TIME: '1h',
        REFRESH_TOKEN_EXPIRATION_TIME: '7d',
        JWT_PUBLIC_KEY: 'test-public',
        JWT_PRIVATE_KEY: 'test-private',
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
        set: redisSetMock,
        get: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(),
      })
      .overrideProvider(EmailService)
      .useValue({
        sendOtpVerificationEmail: sendOtpVerificationEmailMock,
      })
      .overrideProvider(JwtService)
      .useValue({
        signAsync: jwtSignAsyncMock,
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('-> 400 when payload empty', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({})
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when anonymous_id missing', async () => {
    const { anonymous_id: _omit, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when full_name missing', async () => {
    const { full_name: _omit, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, email: 'not-an-email' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when password too short', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, password: 'short' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when gender not in allow list', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, gender: 'unknown' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when dob not a date string', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, dob: 'not-a-date' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, admin: true })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 404 when visitor not found (insert returns no rows)', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, anonymous_id: 'missing_visitor' })
      .expect(404);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 404 when insert hits ON CONFLICT (no rows returned)', async () => {
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(404);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
    expect(redisSetMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped (not unhandled) when bcrypt.hash throws', async () => {
    (hash as unknown as jest.Mock).mockRejectedValueOnce(new Error('bcrypt boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when postgres insert throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when jwt access sign throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([userRow]);
    jwtSignAsyncMock.mockRejectedValueOnce(new Error('jwt boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when jwt refresh sign throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([userRow]);
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockRejectedValueOnce(new Error('jwt boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when refresh-token-hash UPDATE throws', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([userRow])
      .mockRejectedValueOnce(new Error('db down'));
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 404 when refresh-token-hash UPDATE returns no rows', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([]);
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(404);

    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.set throws', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([{ id: userRow.id }]);
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    redisSetMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when email send throws', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([{ id: userRow.id }]);
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    redisSetMock.mockResolvedValueOnce(undefined);
    sendOtpVerificationEmailMock.mockRejectedValueOnce(new Error('smtp boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);
  });

  it('-> 204 with empty body, stores refresh-token hash in Postgres and access in Redis on happy path', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([{ id: userRow.id }]);
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    redisSetMock.mockResolvedValue(undefined);
    sendOtpVerificationEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(204)
      .expect('');

    expect(hash as unknown as jest.Mock).toHaveBeenCalledWith(
      'password123' + 'pepper',
      12,
    );

    expect(jwtSignAsyncMock).toHaveBeenCalledTimes(2);
    expect(jwtSignAsyncMock).toHaveBeenNthCalledWith(1, {
      sub: userRow.id,
      email: userRow.email,
      type: 'access',
      email_verified: userRow.email_verified,
    });
    expect(jwtSignAsyncMock).toHaveBeenNthCalledWith(
      2,
      { sub: userRow.id, email: userRow.email, type: 'refresh' },
      { expiresIn: '7d' },
    );

    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
    const expectedHash = createHash('sha256').update('refresh-token').digest('hex');
    const updateCall = postgresQueryMock.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE users SET refresh_token_hash/);
    expect(updateCall[1]).toEqual([expectedHash, userRow.id]);

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    const [redisKey, redisValue] = redisSetMock.mock.calls[0];
    expect(redisKey).toMatch(/^user:.+\..+$/);
    expect(JSON.parse(redisValue)).toEqual({
      dob: userRow.dob,
      email: userRow.email,
      gender: userRow.gender,
      full_name: userRow.full_name,
      created_at: userRow.created_at.toISOString(),
      two_factor_enabled: userRow.two_factor_enabled,
      access_token: 'access-token',
    });

    expect(sendOtpVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: userRow.email,
        full_name: userRow.full_name,
        otp: expect.any(String),
        expires_in_minutes: 15,
      }),
    );
  });
});