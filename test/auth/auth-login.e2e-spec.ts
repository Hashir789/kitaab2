import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
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

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    jwtSignAsyncMock.mockReset();
    configGetMock.mockReset();
    (compare as unknown as jest.Mock).mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
        REFRESH_TOKEN_EXPIRATION_TIME: '7d',
        ACCESS_TOKEN_EXPIRATION_TIME: '1h',
        JWT_PUBLIC_KEY: 'test-public',
        JWT_PRIVATE_KEY: 'test-private',
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
        signAsync: jwtSignAsyncMock,
        verifyAsync: jest.fn(),
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

  it('POST /auth/login -> 200 and returns tokens', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    postgresQueryMock
      .mockResolvedValueOnce([
        {
          id: 1,
          password_hash: 'hash',
          full_name: 'Muhammad Hashir',
          email: 'muhammad@example.com',
          gender: 'male',
          dob: '2000-01-01',
          created_at: createdAt,
          two_factor_enabled: false,
        },
      ])
      .mockResolvedValueOnce([]);

    (compare as unknown as jest.Mock).mockResolvedValue(true);

    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'muhammad@example.com',
        password: 'password123',
        anonymous_id: 'anon_123',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          dob: '2000-01-01',
          email: 'muhammad@example.com',
          gender: 'male',
          full_name: 'Muhammad Hashir',
          created_at: createdAt.toISOString(),
          two_factor_enabled: false,
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        });
      });

    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
    expect(compare).toHaveBeenCalledTimes(1);
    expect(jwtSignAsyncMock).toHaveBeenCalledTimes(2);
  });

  it('POST /auth/login -> 401 when password invalid', async () => {
    postgresQueryMock.mockResolvedValueOnce([
      {
        id: 1,
        password_hash: 'hash',
        full_name: 'Muhammad Hashir',
        email: 'muhammad@example.com',
        gender: 'male',
        dob: '2000-01-01',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        two_factor_enabled: false,
      },
    ]);

    (compare as unknown as jest.Mock).mockResolvedValue(false);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'muhammad@example.com',
        password: 'wrongpass123',
        anonymous_id: 'anon_123',
      })
      .expect(401);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('POST /auth/login -> 401 when email not found', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'missing@example.com',
        password: 'password123',
        anonymous_id: 'anon_123',
      })
      .expect(401);

    expect(compare).not.toHaveBeenCalled();
    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('POST /auth/login -> 400 when payload invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'not-an-email',
        password: 'short',
        anonymous_id: '',
      })
      .expect(400);
  });
});