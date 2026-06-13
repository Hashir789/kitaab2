import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { compare } from 'bcrypt';

describe('AuthController (e2e) - POST /auth/login', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const configGetMock = jest.fn();
  const hmacEmailMock = jest.fn();

  const validPayload = {
    email: 'muhammad@example.com',
    password: 'password123',
    anonymous_id: 'anon_123',
  };

  const userRow = {
    id: 1,
    password_hash: 'stored-hash',
    two_factor_enabled: false,
    email_verified: true,
  };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    jwtSignAsyncMock.mockReset();
    configGetMock.mockReset();
    hmacEmailMock.mockReset();
    (compare as unknown as jest.Mock).mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
        ACCESS_TOKEN_EXPIRATION_TIME: '1h',
        JWT_PUBLIC_KEY: 'test-public',
        JWT_PRIVATE_KEY: 'test-private',
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
        set: jest.fn(),
        get: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(),
        incrementBy: jest.fn(async () => undefined),
        incrementInHash: jest.fn(async () => 1),
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
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({})
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email missing', async () => {
    const { email, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...validPayload, email: 'not-an-email' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when password missing', async () => {
    const { password, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when password too short', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...validPayload, password: 'short' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when anonymous_id missing', async () => {
    const { anonymous_id, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...validPayload, admin: true })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when email not found', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...validPayload, email: 'missing@example.com' })
      .expect(401);

    expect(compare).not.toHaveBeenCalled();
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when select returns null/undefined', async () => {
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(401);

    expect(compare).not.toHaveBeenCalled();
  });

  it('-> 401 when password mismatch', async () => {
    postgresQueryMock.mockResolvedValueOnce([userRow]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(false);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(401);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when email not verified', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ ...userRow, email_verified: false }]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(401);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when select throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(500);

    expect(compare).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when bcrypt.compare throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([userRow]);
    (compare as unknown as jest.Mock).mockRejectedValueOnce(new Error('bcrypt boom'));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(500);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when last_login update throws', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([userRow])
      .mockRejectedValueOnce(new Error('db down'));
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(500);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 200 and returns access_token when 2FA is disabled', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);
    jwtSignAsyncMock.mockResolvedValueOnce('access-token');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          two_factor_enabled: userRow.two_factor_enabled,
          access_token: 'access-token',
        });
      });

    expect(compare).toHaveBeenCalledWith('password123' + 'pepper', 'stored-hash');
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
    expect(jwtSignAsyncMock).toHaveBeenCalledWith({
      sub: userRow.id,
      email: validPayload.email,
      type: 'access',
      email_verified: true,
    });
  });

  it('-> 200 and returns two_factor_enabled when 2FA enabled', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([{ ...userRow, two_factor_enabled: true }])
      .mockResolvedValueOnce([]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(validPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          two_factor_enabled: true,
        });
      });

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });
});
