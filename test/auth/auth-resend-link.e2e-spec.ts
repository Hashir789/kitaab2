import { hash } from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthController (e2e) - POST /auth/resend-link', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const configGetMock = jest.fn();
  const redisSetMock = jest.fn();
  const sendOtpVerificationEmailMock = jest.fn();
  const hmacEmailMock = jest.fn();

  const validPayload = { full_name: 'Muhammad Hashir', email: 'muhammad@example.com' };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    configGetMock.mockReset();
    redisSetMock.mockReset();
    sendOtpVerificationEmailMock.mockReset();
    hmacEmailMock.mockReset();
    (hash as unknown as jest.Mock).mockReset();
    (hash as unknown as jest.Mock).mockResolvedValue('hashed-otp');

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        OTP_EXPIRES_IN_MINUTES: '15',
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
        set: redisSetMock,
        get: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(),
      })
      .overrideProvider(EmailService)
      .useValue({
        sendOtpVerificationEmail: sendOtpVerificationEmailMock,
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('-> 400 when payload empty', async () => {
    await request(app.getHttpServer()).post('/auth/resend-link').send({}).expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send({ full_name: 'Muhammad Hashir', email: 'not-an-email' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send({ ...validPayload, admin: true })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 404 when user not found', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    const res = await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send(validPayload)
      .expect(404);

    expect(res.body.message).toBe('User not found');
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 204 and resends OTP even when email already verified', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: true }]);
    redisSetMock.mockResolvedValue(undefined);
    sendOtpVerificationEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send(validPayload)
      .expect(204)
      .expect('');

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledTimes(1);
  });

  it('-> 204 on happy path and stores OTP hash in redis + sends email', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: false }]);
    redisSetMock.mockResolvedValue(undefined);
    sendOtpVerificationEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send(validPayload)
      .expect(204)
      .expect('');

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(redisSetMock).toHaveBeenCalledTimes(1);
    const [redisKey, redisValue, ttl] = redisSetMock.mock.calls[0];
    expect(redisKey).toBe('otp:email-hmac');
    expect(redisValue).toBe('hashed-otp');
    expect(ttl).toBe(15 * 60);

    expect(sendOtpVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: validPayload.email,
        full_name: validPayload.full_name,
        expires_in_minutes: 15,
        otp: expect.stringMatching(/^\d{4}$/),
      }),
    );
  });

  it('-> 500 mapped when redis.set throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: false }]);
    redisSetMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer()).post('/auth/resend-link').send(validPayload).expect(500);

    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when sendOtpVerificationEmail throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: false }]);
    redisSetMock.mockResolvedValue(undefined);
    sendOtpVerificationEmailMock.mockRejectedValueOnce(new Error('smtp down'));

    await request(app.getHttpServer()).post('/auth/resend-link').send(validPayload).expect(500);
  });

  it('-> 500 mapped when postgres SELECT throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer()).post('/auth/resend-link').send(validPayload).expect(500);
  });
});
