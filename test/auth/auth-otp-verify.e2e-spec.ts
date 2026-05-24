import request from 'supertest';
import { compare } from 'bcrypt';
import { App } from 'supertest/types';
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

describe('AuthController (e2e) - POST /auth/otp-verify', () => {
  let app: INestApplication<App>;

  const postgresQueryMock = jest.fn();
  const redisGetMock = jest.fn();
  const redisDelMock = jest.fn();
  const hmacEmailMock = jest.fn();

  const validPayload = { email: 'muhammad@example.com', otp: '1234' };

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    redisGetMock.mockReset();
    redisDelMock.mockReset();
    hmacEmailMock.mockReset();
    (compare as unknown as jest.Mock).mockReset();

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
        get: redisGetMock,
        del: redisDelMock,
        ping: jest.fn(),
      })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn(),
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

  it('-> 400 when redis has no stored otp hash', async () => {
    redisGetMock.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(400);

    expect(compare).not.toHaveBeenCalled();
    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 400 when bcrypt.compare returns false (wrong otp)', async () => {
    redisGetMock.mockResolvedValueOnce('stored-otp-hash');
    (compare as unknown as jest.Mock).mockResolvedValueOnce(false);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 400 when UPDATE returns no rows (user vanished)', async () => {
    redisGetMock.mockResolvedValueOnce('stored-otp-hash');
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(400);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.get throws', async () => {
    redisGetMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(500);

    expect(compare).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when bcrypt.compare throws', async () => {
    redisGetMock.mockResolvedValueOnce('stored-otp-hash');
    (compare as unknown as jest.Mock).mockRejectedValueOnce(new Error('bcrypt boom'));

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(500);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when update throws', async () => {
    redisGetMock.mockResolvedValueOnce('stored-otp-hash');
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(500);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 204 and verifies email + deletes redis key on happy path', async () => {
    redisGetMock.mockResolvedValueOnce('stored-otp-hash');
    (compare as unknown as jest.Mock).mockResolvedValueOnce(true);
    postgresQueryMock.mockResolvedValueOnce([{ email_verified: true }]);
    redisDelMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/otp-verify')
      .send(validPayload)
      .expect(204)
      .expect('');

    expect(redisGetMock).toHaveBeenCalledWith('otp:email-hmac');
    expect(compare).toHaveBeenCalledWith(validPayload.otp, 'stored-otp-hash');
    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    const updateCall = postgresQueryMock.mock.calls[0];
    expect(updateCall[0]).toMatch(/UPDATE users SET email_verified = TRUE/);
    expect(updateCall[1]).toEqual(['email-hmac']);
    expect(redisDelMock).toHaveBeenCalledWith('otp:email-hmac');
  });
});
