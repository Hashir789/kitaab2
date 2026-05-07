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

  beforeEach(async () => {
    redisSetMock.mockReset();
    configGetMock.mockReset();
    postgresQueryMock.mockReset();
    sendPasswordResetEmailMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
        PASSWORD_RESET_EXPIRES_IN_SECONDS: '3600',
        PASSWORD_RESET_URL_BASE: '',
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
        set: redisSetMock
      })
      .overrideProvider(EmailService)
      .useValue({
        sendPasswordResetEmail: sendPasswordResetEmailMock
      })
      .overrideProvider(ConfigService)
      .useValue({
        get: configGetMock
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
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

  it('-> 200 and sends email when user exists', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ id: 1, full_name: 'Muhammad' }]);
    redisSetMock.mockResolvedValue(undefined);
    sendPasswordResetEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'muhammad@example.com' })
      .expect(200)
      .expect('');

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'muhammad@example.com',
        name: 'Muhammad',
        expiresInMinutes: 60,
      })
    );
  });
});