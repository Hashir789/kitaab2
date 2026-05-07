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

describe('AuthController (e2e) - POST /auth/signup', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const sendOtpVerificationEmailMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    sendOtpVerificationEmailMock.mockReset();
    jwtSignAsyncMock.mockReset();
    configGetMock.mockReset();

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

  it('POST /auth/signup -> 201 and returns tokens', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    postgresQueryMock.mockResolvedValue([
      {
        id: 1,
        full_name: 'Muhammad Hashir',
        email: 'muhammad@example.com',
        gender: 'male',
        dob: '2000-01-01',
        two_factor_enabled: false,
        created_at: createdAt,
      },
    ]);

    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    sendOtpVerificationEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        anonymous_id: 'anon_123',
        full_name: 'Muhammad Hashir',
        email: 'muhammad@example.com',
        password: 'password123',
        gender: 'male',
        dob: '2000-01-01',
      })
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

  it('POST /auth/signup -> 404 when visitor not found (or insert did nothing)', async () => {
    postgresQueryMock.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        anonymous_id: 'missing_visitor',
        full_name: 'Muhammad Hashir',
        email: 'muhammad@example.com',
        password: 'password123',
        gender: 'male',
        dob: '2000-01-01',
      })
      .expect(404);

    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('POST /auth/signup -> 400 when payload invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        anonymous_id: '',
        full_name: '',
        email: 'not-an-email',
        password: 'short',
        gender: 'unknown',
        dob: 'not-a-date',
      })
      .expect(400);
  });
});