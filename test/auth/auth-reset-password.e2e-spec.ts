import request from 'supertest';
import { App } from 'supertest/types';
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

describe('AuthController (e2e) - POST /auth/reset-password', () => {
  let app: INestApplication<App>;

  const redisGetMock = jest.fn();
  const redisDelMock = jest.fn();
  const configGetMock = jest.fn();
  const postgresQueryMock = jest.fn();

  beforeEach(async () => {
    redisGetMock.mockReset();
    redisDelMock.mockReset();
    configGetMock.mockReset();
    postgresQueryMock.mockReset();
    (hash as unknown as jest.Mock).mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper'
      };
      return table[key];
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PostgresService)
      .useValue({
        query: postgresQueryMock,
        ping: jest.fn()
      })
      .overrideProvider(RedisService)
      .useValue({
        set: jest.fn(),
        ping: jest.fn(),
        get: redisGetMock,
        del: redisDelMock
      })
      .overrideProvider(EmailService)
      .useValue({
        sendPasswordResetEmail: jest.fn()
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
        transform: true,
        forbidNonWhitelisted: true
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('-> 400 when token invalid/expired', async () => {
    redisGetMock.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'bad-token', new_password: 'password123' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 200 when token valid', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    (hash as unknown as jest.Mock).mockResolvedValueOnce('hash');
    postgresQueryMock.mockResolvedValueOnce([{ id: 1 }]);
    redisDelMock.mockResolvedValueOnce(1);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'good-token', new_password: 'password123' })
      .expect(200)
      .expect('');

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(redisDelMock).toHaveBeenCalledTimes(1);
  });
});