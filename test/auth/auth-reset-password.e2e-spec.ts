import request from 'supertest';
import { App } from 'supertest/types';
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

describe('AuthController (e2e) - POST /auth/reset-password', () => {
  let app: INestApplication<App>;

  const redisGetMock = jest.fn();
  const redisDelMock = jest.fn();
  const configGetMock = jest.fn();
  const postgresQueryMock = jest.fn();
  const unlockMasterKeyWithRecoveryKeyMock = jest.fn();
  const wrapMasterKeyWithPasswordMock = jest.fn();

  const validPayload = {
    token: 'good-token',
    new_password: 'password123',
    recovery_key: 'recovery-key-12345',
  };

  const selectRow = {
    id: '1',
    recovery_key_salt: 'recovery-key-salt',
    recovery_key_iv: 'recovery-key-iv',
    recovery_encrypted_master_key: 'recovery-encrypted-master-key',
  };

  beforeEach(async () => {
    redisGetMock.mockReset();
    redisDelMock.mockReset();
    configGetMock.mockReset();
    postgresQueryMock.mockReset();
    unlockMasterKeyWithRecoveryKeyMock.mockReset();
    wrapMasterKeyWithPasswordMock.mockReset();
    (hash as unknown as jest.Mock).mockReset();

    configGetMock.mockImplementation((key: string) => {
      const table: Record<string, any> = {
        PASSWORD_PEPPER: 'pepper',
      };
      return table[key];
    });

    unlockMasterKeyWithRecoveryKeyMock.mockReturnValue(Buffer.alloc(32, 1));
    wrapMasterKeyWithPasswordMock.mockReturnValue({
      key_salt: 'new-key-salt',
      key_iv: 'new-key-iv',
      encrypted_master_key: 'new-encrypted-master-key',
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
      .overrideProvider(EncryptionService)
      .useValue({
        unlockMasterKeyWithRecoveryKey: unlockMasterKeyWithRecoveryKeyMock,
        wrapMasterKeyWithPassword: wrapMasterKeyWithPasswordMock,
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
    const { token, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(rest)
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('-> 400 when new_password missing', async () => {
    const { new_password, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(rest)
      .expect(400);

    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('-> 400 when recovery_key missing', async () => {
    const { recovery_key, ...rest } = validPayload;

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(rest)
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

  it('-> 400 when SELECT returns no rows (user gone)', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    postgresQueryMock.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(400);

    expect(unlockMasterKeyWithRecoveryKeyMock).not.toHaveBeenCalled();
    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when unlock throws (invalid recovery key)', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    postgresQueryMock.mockResolvedValueOnce([selectRow]);
    unlockMasterKeyWithRecoveryKeyMock.mockImplementationOnce(() => {
      throw new Error('Invalid recovery key.');
    });

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);

    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 400 when UPDATE returns no rows', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    postgresQueryMock
      .mockResolvedValueOnce([selectRow])
      .mockResolvedValueOnce([]);
    (hash as unknown as jest.Mock).mockResolvedValueOnce('new-hash');

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

    expect(postgresQueryMock).not.toHaveBeenCalled();
    expect(hash as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when bcrypt.hash throws', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    postgresQueryMock.mockResolvedValueOnce([selectRow]);
    (hash as unknown as jest.Mock).mockRejectedValueOnce(new Error('bcrypt boom'));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);
  });

  it('-> 500 mapped when postgres update throws', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    postgresQueryMock
      .mockResolvedValueOnce([selectRow])
      .mockRejectedValueOnce(new Error('db down'));
    (hash as unknown as jest.Mock).mockResolvedValueOnce('new-hash');

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);

    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('-> 500 mapped when redis.del throws', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    postgresQueryMock
      .mockResolvedValueOnce([selectRow])
      .mockResolvedValueOnce([{ id: 1 }]);
    (hash as unknown as jest.Mock).mockResolvedValueOnce('new-hash');
    redisDelMock.mockRejectedValueOnce(new Error('redis boom'));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(500);
  });

  it('-> 204 and clears token on happy path', async () => {
    redisGetMock.mockResolvedValueOnce('1');
    postgresQueryMock
      .mockResolvedValueOnce([selectRow])
      .mockResolvedValueOnce([{ id: 1 }]);
    (hash as unknown as jest.Mock).mockResolvedValueOnce('new-hash');
    redisDelMock.mockResolvedValueOnce(1);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send(validPayload)
      .expect(204)
      .expect('');

    expect(redisGetMock).toHaveBeenCalledWith('password-reset:good-token');
    expect(unlockMasterKeyWithRecoveryKeyMock).toHaveBeenCalledWith({
      recovery_key: validPayload.recovery_key,
      recovery_key_salt: selectRow.recovery_key_salt,
      recovery_key_iv: selectRow.recovery_key_iv,
      recovery_encrypted_master_key: selectRow.recovery_encrypted_master_key,
    });
    expect(wrapMasterKeyWithPasswordMock).toHaveBeenCalledTimes(1);
    expect(hash as unknown as jest.Mock).toHaveBeenCalledWith(
      'password123' + 'pepper',
      12,
    );
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
    const updateCall = postgresQueryMock.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE users/);
    expect(updateCall[1]).toEqual([
      'new-hash',
      'new-key-salt',
      'new-key-iv',
      'new-encrypted-master-key',
      '1',
    ]);
    expect(redisDelMock).toHaveBeenCalledWith('password-reset:good-token');
  });
});
