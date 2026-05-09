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

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { compare, hash } from 'bcrypt';

describe('AuthController (e2e) - PATCH /auth/password', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    configGetMock.mockReset();
    (compare as unknown as jest.Mock).mockReset();
    (hash as unknown as jest.Mock).mockReset();

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
        get: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(),
      })
      .overrideProvider(JwtService)
      .useValue({
        signAsync: jest.fn(),
        verifyAsync: jwtVerifyAsyncMock,
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

  it('-> 401 when Authorization header missing', async () => {
    await request(app.getHttpServer())
      .patch('/auth/password')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when Authorization header malformed', async () => {
    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Token abc')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 (not 500) when token invalid', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer bad-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when token type is not access (guard)', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'refresh',
      email_verified: true,
    });

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer refresh-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 403 when email not verified (guard)', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: false,
    });

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(403);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload missing current_password', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ new_password: 'password456' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload missing new_password', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when new_password too short', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'short' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({
        current_password: 'password123',
        new_password: 'password456',
        admin: true,
      })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when current_password and new_password are equal', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password123' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(compare as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('-> 401 when user not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 999,
      email: 'missing@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(401);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(compare as unknown as jest.Mock).not.toHaveBeenCalled();
    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('-> 401 when user query returns null/undefined', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(401);

    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('-> 401 when current password does not match', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock.mockResolvedValueOnce([{ id: 1, password_hash: 'stored-hash' }]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(false);

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'wrong-password', new_password: 'password456' })
      .expect(401);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped (not unhandled) when bcrypt.compare throws', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock.mockResolvedValueOnce([{ id: 1, password_hash: 'stored-hash' }]);
    (compare as unknown as jest.Mock).mockRejectedValueOnce(new Error('bcrypt boom'));

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(500);

    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when postgres select throws', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(500);
  });

  it('-> 401 when update returns no rows (race condition)', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock
      .mockResolvedValueOnce([{ id: 1, password_hash: 'stored-hash' }])
      .mockResolvedValueOnce([]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);
    (hash as unknown as jest.Mock).mockResolvedValueOnce('new-hash');

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(401);

    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('-> 204 when current password matches and update succeeds', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock
      .mockResolvedValueOnce([{ id: 1, password_hash: 'stored-hash' }])
      .mockResolvedValueOnce([{ id: 1 }]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);
    (hash as unknown as jest.Mock).mockResolvedValueOnce('new-hash');

    await request(app.getHttpServer())
      .patch('/auth/password')
      .set('Authorization', 'Bearer access-token')
      .send({ current_password: 'password123', new_password: 'password456' })
      .expect(204)
      .expect('');

    expect(compare as unknown as jest.Mock).toHaveBeenCalledWith(
      'password123' + 'pepper',
      'stored-hash',
    );
    expect(hash as unknown as jest.Mock).toHaveBeenCalledWith(
      'password456' + 'pepper',
      12,
    );
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });
});
