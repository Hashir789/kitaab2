import request from 'supertest';
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

  const postgresQueryMock = jest.fn();
  const sendOtpVerificationEmailMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  const validPayload = {
    anonymous_id: 'anon_123',
    full_name: 'Muhammad Hashir',
    email: 'muhammad@example.com',
    password: 'password123',
    gender: 'male',
    dob: '2000-01-01',
  };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    sendOtpVerificationEmailMock.mockReset();
    jwtSignAsyncMock.mockReset();
    configGetMock.mockReset();
    (hash as unknown as jest.Mock).mockReset();
    (hash as unknown as jest.Mock).mockResolvedValue('hashed-password');

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
        REFRESH_TOKEN_EXPIRATION_TIME: '7d',
        OTP_EXPIRES_IN_MINUTES: '15',
        ACCESS_TOKEN_EXPIRATION_TIME: '1h',
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
        set: jest.fn(),
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
    const { anonymous_id, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when full_name missing', async () => {
    const { full_name, ...rest } = validPayload;

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

    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 404 when insert hits ON CONFLICT (no rows returned)', async () => {
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(404);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
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

  it('-> 500 mapped when jwt sign throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([
      {
        id: 1,
        full_name: 'Muhammad Hashir',
        email: 'muhammad@example.com',
        gender: 'male',
        dob: '2000-01-01',
        two_factor_enabled: false,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        email_verified: false,
      },
    ]);
    jwtSignAsyncMock.mockRejectedValueOnce(new Error('jwt boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when email send throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([
      {
        id: 1,
        full_name: 'Muhammad Hashir',
        email: 'muhammad@example.com',
        gender: 'male',
        dob: '2000-01-01',
        two_factor_enabled: false,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        email_verified: false,
      },
    ]);
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    sendOtpVerificationEmailMock.mockRejectedValueOnce(new Error('smtp boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);
  });

  it('-> 201 and returns tokens on happy path', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    postgresQueryMock.mockResolvedValueOnce([
      {
        id: 1,
        full_name: 'Muhammad Hashir',
        email: 'muhammad@example.com',
        gender: 'male',
        dob: '2000-01-01',
        two_factor_enabled: false,
        created_at: createdAt,
        email_verified: false,
      },
    ]);

    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    sendOtpVerificationEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual({
          dob: '2000-01-01',
          email: 'muhammad@example.com',
          gender: 'male',
          full_name: 'Muhammad Hashir',
          created_at: createdAt.toISOString(),
          two_factor_enabled: false,
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        });
      });

    expect(hash as unknown as jest.Mock).toHaveBeenCalledWith(
      'password123' + 'pepper',
      12,
    );
    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(jwtSignAsyncMock).toHaveBeenCalledTimes(2);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'muhammad@example.com',
        name: 'Muhammad Hashir',
        otp: expect.any(String),
        expiresInMinutes: 15,
      }),
    );
  });
});
