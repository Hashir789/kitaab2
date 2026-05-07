import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('VisitorsController (e2e) - POST /visitors/email', () => {
  let app: INestApplication<App>;
  const postgresQueryMock = jest.fn();
  const sendVisitorEmailCopyMock = jest.fn();

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    sendVisitorEmailCopyMock.mockReset();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PostgresService)
      .useValue({
        query: postgresQueryMock,
        ping: jest.fn(),
      })
      .overrideProvider(EmailService)
      .useValue({
        sendVisitorEmailCopy: sendVisitorEmailCopyMock,
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

  it('POST /visitors/email -> 204 (no auth required)', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    postgresQueryMock.mockResolvedValue([
      {
        timezone: 'Asia/Karachi',
        created_at: createdAt,
      },
    ]);
    sendVisitorEmailCopyMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/visitors/email')
      .send({
        anonymous_id: 'anon_123',
        email: 'muhammad@example.com',
      })
      .expect(204)
      .expect('');

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(sendVisitorEmailCopyMock).toHaveBeenCalledTimes(1);
    expect(sendVisitorEmailCopyMock).toHaveBeenCalledWith({
      email: 'muhammad@example.com',
      timezone: 'Asia/Karachi',
      created_at: createdAt,
    });
  });

  it('POST /visitors/email -> 404 when visitor not found', async () => {
    postgresQueryMock.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post('/visitors/email')
      .send({
        anonymous_id: 'missing_visitor',
        email: 'muhammad@example.com',
      })
      .expect(404);

    expect(sendVisitorEmailCopyMock).not.toHaveBeenCalled();
  });

  it('POST /visitors/email -> 400 when payload invalid', async () => {
    await request(app.getHttpServer())
      .post('/visitors/email')
      .send({
        anonymous_id: '',
        email: 'not-an-email',
      })
      .expect(400);
  });
});