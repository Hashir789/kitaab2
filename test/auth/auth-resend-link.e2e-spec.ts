import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('AuthController (e2e) - POST /auth/resend-link', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const configGetMock = jest.fn();
  const sendOtpVerificationEmailMock = jest.fn();

  const validPayload = { email: 'muhammad@example.com' };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    configGetMock.mockReset();
    sendOtpVerificationEmailMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        OTP_EXPIRES_IN_MINUTES: '15',
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
    await request(app.getHttpServer()).post('/auth/resend-link').send({}).expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send({ email: 'not-an-email' })
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
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email already verified', async () => {
    postgresQueryMock.mockResolvedValueOnce([
      { full_name: 'Muhammad Hashir', email_verified: true },
    ]);

    const res = await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send(validPayload)
      .expect(400);

    expect(res.body.message).toBe('Email already verified');
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 404 when UPDATE returns no rows', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([{ full_name: 'Muhammad Hashir', email_verified: false }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer()).post('/auth/resend-link').send(validPayload).expect(404);

    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 204 on happy path and sends OTP email', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([{ full_name: 'Muhammad Hashir', email_verified: false }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await request(app.getHttpServer())
      .post('/auth/resend-link')
      .send(validPayload)
      .expect(204)
      .expect('');

    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: validPayload.email,
        full_name: 'Muhammad Hashir',
        expires_in_minutes: 15,
      }),
    );
    expect(typeof sendOtpVerificationEmailMock.mock.calls[0][0].otp).toBe('string');
  });

  it('-> 500 mapped when sendOtpVerificationEmail throws', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([{ full_name: 'Muhammad Hashir', email_verified: false }])
      .mockResolvedValueOnce([{ id: 1 }]);
    sendOtpVerificationEmailMock.mockRejectedValueOnce(new Error('smtp down'));

    await request(app.getHttpServer()).post('/auth/resend-link').send(validPayload).expect(500);
  });

  it('-> 500 mapped when postgres SELECT throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer()).post('/auth/resend-link').send(validPayload).expect(500);
  });
});