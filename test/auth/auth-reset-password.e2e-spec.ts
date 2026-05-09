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

  const validPayload = { token: 'good-token', new_password: 'password123' };

  beforeEach(async () => {
    redisGetMock.mockReset();
    redisDelMock.mockReset();
    configGetMock.mockReset();
    postgresQueryMock.mockReset();
    (hash as unknown as jest.Mock).mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
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
        ping: jest.fn(),
        get: redisGetMock,
        del: redisDelMock,
      })
      .overrideProvider(EmailService)
      .useValue({
        sendPasswordResetEmail: jest.fn(),
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
        transform: true,
        forbidNonWhitelisted: true,
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
      .post('/auth/reset-password')
      .send({})
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('-> 400 when token missing', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ new_password: 'password123' })
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('-> 400 when new_password missing', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'good-token' })
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('-> 400 when new_password too short', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ ...validPayload, new_password: 'short' })
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ ...validPayload, admin: true })
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('-> 400 when token invalid/expired', async () => {
    redisGetMock.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ ...validPayload, token: 'bad-token' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 400 when update returns no rows', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    (hash as unknown as jest.Mock).mockResolvedValueOnce('hash');
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(400);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.get throws', async () => {
    redisGetMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);

    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when bcrypt.hash throws', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    (hash as unknown as jest.Mock).mockRejectedValueOnce(new Error('bcrypt boom'));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when postgres update throws', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    (hash as unknown as jest.Mock).mockResolvedValueOnce('hash');
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.del throws', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    (hash as unknown as jest.Mock).mockResolvedValueOnce('hash');
    postgresQueryMock.mockResolvedValueOnce([{ id: 1 }]);
    redisDelMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);
  });

  it('-> 200 and clears token on happy path', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    (hash as unknown as jest.Mock).mockResolvedValueOnce('new-hash');
    postgresQueryMock.mockResolvedValueOnce([{ id: 1 }]);
    redisDelMock.mockResolvedValueOnce(1);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(200)
      .expect('');

    expect(redisGetMock).toHaveBeenCalledWith('password-reset:good-token');
    expect(hash as unknown as jest.Mock).toHaveBeenCalledWith(
      'password123' + 'pepper',
      12,
    );
    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(redisDelMock).toHaveBeenCalledWith('password-reset:good-token');
  });
});
