import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../../src/database/redis/redis.service';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { PostgresService } from '../../src/database/postgres/postgres.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { hash } from 'bcrypt';

describe('AuthController (e2e) - POST /auth/signup', () => {
  let app: INestApplication<App>;

  const redisSetMock = jest.fn();
  const configGetMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const postgresQueryMock = jest.fn();
  const sendOtpVerificationEmailMock = jest.fn();

  const hmacEmailMock = jest.fn();
  const createVaultMock = jest.fn();
  const splitPackedBlobMock = jest.fn();
  const encryptFieldMock = jest.fn();

  const validPayload = {
    anonymous_id: 'anon_123',
    full_name: 'Muhammad Hashir',
    email: 'muhammad@example.com',
    password: 'password123',
    recovery_key: 'recovery-key-12345',
    gender: 'male',
    dob: '2000-01-01',
  };

  const insertedRow = {
    id: 1,
    email_verified: false,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    redisSetMock.mockReset();
    configGetMock.mockReset();
    jwtSignAsyncMock.mockReset();
    postgresQueryMock.mockReset();
    sendOtpVerificationEmailMock.mockReset();
    hmacEmailMock.mockReset();
    createVaultMock.mockReset();
    splitPackedBlobMock.mockReset();
    encryptFieldMock.mockReset();
    (hash as unknown as jest.Mock).mockReset();
    (hash as unknown as jest.Mock).mockResolvedValue('hashed-secret');

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
        OTP_EXPIRES_IN_MINUTES: '15',
        ACCESS_TOKEN_EXPIRATION_TIME: '1h',
        JWT_PUBLIC_KEY: 'test-public',
        JWT_PRIVATE_KEY: 'test-private',
      };
      return table[key];
    });

    hmacEmailMock.mockReturnValue('email-hmac');
    createVaultMock.mockReturnValue({
      master_key: Buffer.alloc(32, 1),
      record: {
        wrapped_by_password: 'wrapped-pw',
        wrapped_by_recovery: 'wrapped-rec',
        password_salt: 'key-salt',
        recovery_salt: 'recovery-key-salt',
      },
      recovery_key: null,
    });
    splitPackedBlobMock.mockImplementation((packed: string) =>
      packed === 'wrapped-pw'
        ? { iv: 'key-iv', ciphertext: 'encrypted-master-key' }
        : { iv: 'recovery-key-iv', ciphertext: 'recovery-encrypted-master-key' },
    );
    encryptFieldMock.mockReturnValue('encrypted-full-name');

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
        set: redisSetMock,
        get: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(),
      })
      .overrideProvider(EmailService)
      .useValue({
        sendOtpVerificationEmail: sendOtpVerificationEmailMock,
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
        createVault: createVaultMock,
        splitPackedBlob: splitPackedBlobMock,
        encryptField: encryptFieldMock,
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
      .post('/auth/signup')
      .send({})
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when anonymous_id missing', async () => {
    const { anonymous_id: _omit, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when full_name missing', async () => {
    const { full_name: _omit, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when recovery_key missing', async () => {
    const { recovery_key: _omit, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(rest)
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when email invalid', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, email: 'not-an-email' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when password too short', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, password: 'short' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when gender not in allow list', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, gender: 'unknown' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when dob not a date string', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, dob: 'not-a-date' })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 400 when payload contains forbidden extra fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, admin: true })
      .expect(400);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 404 when visitor not found (insert returns no rows)', async () => {
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...validPayload, anonymous_id: 'missing_visitor' })
      .expect(404);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 404 when insert hits ON CONFLICT (no rows returned)', async () => {
    postgresQueryMock.mockResolvedValueOnce(undefined);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(404);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
    expect(redisSetMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped (not unhandled) when bcrypt.hash throws on password', async () => {
    (hash as unknown as jest.Mock).mockRejectedValueOnce(new Error('bcrypt boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when postgres insert throws', async () => {
    postgresQueryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(jwtSignAsyncMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when jwt access sign throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([insertedRow]);
    jwtSignAsyncMock.mockRejectedValueOnce(new Error('jwt boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(redisSetMock).not.toHaveBeenCalled();
    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.set throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([insertedRow]);
    jwtSignAsyncMock.mockResolvedValueOnce('access-token');
    redisSetMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);

    expect(sendOtpVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when email send throws', async () => {
    postgresQueryMock.mockResolvedValueOnce([insertedRow]);
    jwtSignAsyncMock.mockResolvedValueOnce('access-token');
    redisSetMock.mockResolvedValueOnce(undefined);
    sendOtpVerificationEmailMock.mockRejectedValueOnce(new Error('smtp boom'));

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(500);
  });

  it('-> 201 returns vault material, hashes OTP into Redis, sends verification email on happy path', async () => {
    postgresQueryMock.mockResolvedValueOnce([insertedRow]);
    jwtSignAsyncMock.mockResolvedValueOnce('access-token');
    redisSetMock.mockResolvedValue(undefined);
    sendOtpVerificationEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(validPayload)
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual({
          dob: validPayload.dob,
          gender: validPayload.gender,
          email: 'email-hmac',
          full_name: 'encrypted-full-name',
          key_salt: 'key-salt',
          key_iv: 'key-iv',
          encrypted_master_key: 'encrypted-master-key',
          access_token: 'access-token',
          created_at: insertedRow.created_at.toISOString(),
        });
      });

    expect(hash as unknown as jest.Mock).toHaveBeenCalledWith(
      'password123' + 'pepper',
      12,
    );

    expect(jwtSignAsyncMock).toHaveBeenCalledTimes(1);
    expect(jwtSignAsyncMock).toHaveBeenCalledWith({
      sub: insertedRow.id,
      email: validPayload.email,
      type: 'access',
      email_verified: insertedRow.email_verified,
    });

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    const insertCall = postgresQueryMock.mock.calls[0];
    expect(insertCall[0]).toMatch(/INSERT INTO users/);
    expect(insertCall[1]).toEqual([
      'email-hmac',
      'hashed-secret',
      'encrypted-full-name',
      validPayload.gender,
      validPayload.dob,
      'key-salt',
      'key-iv',
      'encrypted-master-key',
      'recovery-key-salt',
      'recovery-key-iv',
      'recovery-encrypted-master-key',
      validPayload.anonymous_id,
    ]);

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    const [redisKey, redisValue, ttl] = redisSetMock.mock.calls[0];
    expect(redisKey).toBe('otp:email-hmac');
    expect(redisValue).toBe('hashed-secret');
    expect(ttl).toBe(15 * 60);

    expect(sendOtpVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendOtpVerificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: validPayload.email,
        full_name: validPayload.full_name,
        otp: expect.stringMatching(/^\d{4}$/),
        expires_in_minutes: 15,
      }),
    );
  });
});
