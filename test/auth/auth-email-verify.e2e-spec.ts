import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('AuthController (e2e) - GET /auth/email-verify', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();

  beforeEach(async () => {
    postgresQueryMock.mockReset();

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
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn(),
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

  it('-> 400 when query empty', async () => {
    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email missing', async () => {
    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({})
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email empty string', async () => {
    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: '' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: 'not-an-email' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when query contains forbidden extra params', async () => {
    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: 'muhammad@example.com', admin: 'true' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when postgres throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: 'muhammad@example.com' })
      .expect(500);
  });

  it('-> 200 and { verified: null } when user not found', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: 'missing@example.com' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ verified: null });
      });
  });

  it('-> 200 and { verified: null } when select returns null/undefined', async () => {
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: 'missing@example.com' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ verified: null });
      });
  });

  it('-> 200 and { verified: true } when user email_verified=true', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: true }]);

    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: 'muhammad@example.com' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ verified: true });
      });
  });

  it('-> 200 and { verified: false } when user email_verified=false', async () => {
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: false }]);

    await request(app.getHttpServer())
      .get('/auth/email-verify')
      .query({ email: 'muhammad@example.com' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ verified: false });
      });
  });
});
