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
import { EncryptionService } from '../../src/encryption/encryption.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('UsersController (e2e) - GET /users/me', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const configGetMock = jest.fn();

  const userRow = {
    id: 1,
    email: 'email-hmac',
    full_name: 'encrypted-full-name',
    gender: 'male',
    dob: '2000-01-01',
    key_salt: 'key-salt',
    key_iv: 'key-iv',
    encrypted_master_key: 'encrypted-master-key',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    configGetMock.mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        JWT_PUBLIC_KEY: 'test-public',
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
      .overrideProvider(EncryptionService)
      .useValue({
        hmacEmail: jest.fn(),
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
    await request(app.getHttpServer()).get('/users/me').expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when Authorization header malformed', async () => {
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Token abc')
      .expect(401);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 (not 500) when token invalid', async () => {
    jwtVerifyAsyncMock.mockRejectedValueOnce(new Error('jwt malformed'));

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer bad-token')
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
      .get('/users/me')
      .set('Authorization', 'Bearer refresh-token')
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
      .get('/users/me')
      .set('Authorization', 'Bearer access-token')
      .expect(403);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 404 when user not found', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 999,
      email: 'missing@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer access-token')
      .expect(404);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
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
      .get('/users/me')
      .set('Authorization', 'Bearer access-token')
      .expect(500);
  });

  it('-> 200 returns the current user profile on happy path', async () => {
    jwtVerifyAsyncMock.mockResolvedValueOnce({
      sub: 1,
      email: 'muhammad@example.com',
      type: 'access',
      email_verified: true,
    });
    postgresQueryMock.mockResolvedValueOnce([userRow]);

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          id: userRow.id,
          email: userRow.email,
          full_name: userRow.full_name,
          gender: userRow.gender,
          dob: userRow.dob,
          key_salt: userRow.key_salt,
          key_iv: userRow.key_iv,
          encrypted_master_key: userRow.encrypted_master_key,
          created_at: userRow.created_at.toISOString(),
        });
      });

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    const selectCall = postgresQueryMock.mock.calls[0];
    expect(selectCall[0]).toMatch(/SELECT[\s\S]*FROM users WHERE id = \$1/);
    expect(selectCall[1]).toEqual([1]);
  });
});
