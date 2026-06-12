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

describe('AuthController (e2e) - POST /auth/login/backoffice', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const configGetMock = jest.fn();
  const hmacEmailMock = jest.fn();

  const validPayload = {
    email: 'muhammad@example.com',
    password: 'password123',
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
      const table: Record<string, string> = {
        PASSWORD_PEPPER: 'pepper',
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

  it('-> 200 and returns only access_token', async () => {
    postgresQueryMock.mockResolvedValueOnce([userRow]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);
    jwtSignAsyncMock.mockResolvedValueOnce('access-token');

    await request(app.getHttpServer())
      .post('/auth/login/backoffice')
      .send(validPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ access_token: 'access-token' });
      });

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith('password123' + 'pepper', 'stored-hash');
    expect(jwtSignAsyncMock).toHaveBeenCalledWith({
      sub: userRow.id,
      email: validPayload.email,
      type: 'access',
      email_verified: true,
    });
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/login/backoffice')
      .send({ ...validPayload, anonymous_id: 'anon_123' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 401 when email not found', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/login/backoffice')
      .send(validPayload)
      .expect(401);

    expect(compare).not.toHaveBeenCalled();
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 401 when password mismatch', async () => {
    postgresQueryMock.mockResolvedValueOnce([userRow]);
    (compare as unknown as jest.Mock).mockResolvedValueOnce(false);

    await request(app.getHttpServer())
      .post('/auth/login/backoffice')
      .send(validPayload)
      .expect(401);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });
});
