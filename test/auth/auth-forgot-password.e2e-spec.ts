import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('AuthController (e2e) - POST /auth/forgot-password', () => {
  let app: INestApplication<App>;

  const redisSetMock = jest.fn();
  const configGetMock = jest.fn();
  const postgresQueryMock = jest.fn();
  const sendPasswordResetEmailMock = jest.fn();

  const setupApp = async (configOverrides: Record<string, any> = {}) => {
    redisSetMock.mockReset();
    configGetMock.mockReset();
    postgresQueryMock.mockReset();
    sendPasswordResetEmailMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
        PASSWORD_RESET_EXPIRES_IN_SECONDS: '3600',
        PASSWORD_RESET_URL_BASE: '',
        ...configOverrides,
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
        get: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(),
        set: redisSetMock,
      })
      .overrideProvider(EmailService)
      .useValue({
        sendPasswordResetEmail: sendPasswordResetEmailMock,
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
  };

  beforeEach(async () => {
    await setupApp();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('-> 400 when payload empty', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({})
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'muhammad@example.com', admin: true })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 404 when email not found', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'missing@example.com' })
      .expect(404);

    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it('-> 404 when select returns null/undefined', async () => {
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'muhammad@example.com' })
      .expect(404);

    expect(redisSetMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when select throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'muhammad@example.com' })
      .expect(500);

    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.set throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ id: 1, full_name: 'Muhammad' }]);
    redisSetMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'muhammad@example.com' })
      .expect(500);

    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when email send throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ id: 1, full_name: 'Muhammad' }]);
    redisSetMock.mockResolvedValue(undefined);
    sendPasswordResetEmailMock.mockRejectedValueOnce(new Error('smtp boom'));

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'muhammad@example.com' })
      .expect(500);
  });

  it('-> 200 and sends email with plainToken when reset URL not configured', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ id: 1, full_name: 'Muhammad' }]);
    redisSetMock.mockResolvedValue(undefined);
    sendPasswordResetEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'muhammad@example.com' })
      .expect(200)
      .expect('');

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    expect(redisSetMock).toHaveBeenCalledWith(
      expect.stringMatching(/^password-reset:[a-f0-9]{64}$/),
      '1',
      3600,
    );
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'muhammad@example.com',
        name: 'Muhammad',
        resetLink: null,
        plainToken: expect.any(String),
        expiresInMinutes: 60,
      }),
    );
  });

  it('-> 200 and sends email with resetLink when reset URL configured', async () => {
    await app.close();
    await setupApp({ PASSWORD_RESET_URL_BASE: 'https://app.example.com/reset' });

    postgresQueryMock.mockResolvedValueOnce([{ id: 2, full_name: 'Hashir' }]);
    redisSetMock.mockResolvedValue(undefined);
    sendPasswordResetEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'hashir@example.com' })
      .expect(200);

    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'hashir@example.com',
        name: 'Hashir',
        resetLink: expect.stringMatching(
          /^https:\/\/app\.example\.com\/reset\?token=[a-f0-9]{64}$/,
        ),
        plainToken: undefined,
        expiresInMinutes: 60,
      }),
    );
  });
});
