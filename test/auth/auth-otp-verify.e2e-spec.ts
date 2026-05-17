import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';
import { CryptoService } from '../../src/crypto/crypto.service';

const speakeasyVerifyMock = jest.fn();

jest.mock('speakeasy', () => ({
  totp: {
    verify: (...args: any[]) => speakeasyVerifyMock(...args),
  },
  generateSecret: jest.fn(() => ({ base32: 'TEST_SECRET' })),
}));

describe('AuthController (e2e) - POST /auth/otp-verify', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();

  const validPayload = { email: 'muhammad@example.com', otp: '1234' };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    speakeasyVerifyMock.mockReset();

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
      .overrideProvider(CryptoService)
      .useValue({
        encryptEmailForLookup: jest.fn().mockResolvedValue('encrypted-email'),
        decryptSecret: jest.fn().mockResolvedValue('BASE32SECRET'),
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
      .post('/auth/otp-verify')
      .send({})
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email missing', async () => {
    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send({ otp: '1234' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send({ ...validPayload, email: 'not-an-email' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when otp missing', async () => {
    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send({ email: 'muhammad@example.com' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when otp wrong length', async () => {
    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send({ ...validPayload, otp: '12' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when otp non-numeric', async () => {
    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send({ ...validPayload, otp: 'abcd' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send({ ...validPayload, admin: true })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 404 when user not found', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send({ ...validPayload, email: 'missing@example.com' })
      .expect(404);

    expect(speakeasyVerifyMock).not.toHaveBeenCalled();
  });

  it('-> 404 when select returns null/undefined', async () => {
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(404);

    expect(speakeasyVerifyMock).not.toHaveBeenCalled();
  });

  it('-> 400 when otp invalid/expired', async () => {
    postgresQueryMock.mockResolvedValueOnce([
      { secret: 'BASE32SECRET', email_verified: false },
    ]);
    speakeasyVerifyMock.mockReturnValueOnce(false);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(400);

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
  });

  it('-> 500 mapped when select throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(500);

    expect(speakeasyVerifyMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when update throws', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([{ secret: 'BASE32SECRET', email_verified: false }])
      .mockRejectedValueOnce(new Error('db down'));
    speakeasyVerifyMock.mockReturnValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(500);
  });

  it('-> 500 mapped when speakeasy verify throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([
      { secret: 'BASE32SECRET', email_verified: false },
    ]);
    speakeasyVerifyMock.mockImplementationOnce(() => {
      throw new Error('totp boom');
    });

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(500);
  });

  it('-> 200 and verifies (updates when previously unverified)', async () => {
    postgresQueryMock
      .mockResolvedValueOnce([{ secret: 'BASE32SECRET', email_verified: false }])
      .mockResolvedValueOnce([]);
    speakeasyVerifyMock.mockReturnValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({});
      });

    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('-> 200 and verifies (no update when already verified)', async () => {
    postgresQueryMock.mockResolvedValueOnce([
      { secret: 'BASE32SECRET', email_verified: true },
    ]);
    speakeasyVerifyMock.mockReturnValueOnce(true);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({});
      });

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
  });
});
