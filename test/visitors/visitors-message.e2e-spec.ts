import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../src/email/email.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('VisitorsController (e2e) - POST /visitors/message', () => {
  let app: INestApplication<App>;
  const postgresQueryMock = jest.fn();
  const sendVisitorMessageCopyEmailMock = jest.fn();

  beforeEach(async () => {
    postgresQueryMock.mockReset();
    sendVisitorMessageCopyEmailMock.mockReset();

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
        sendVisitorMessageCopyEmail: sendVisitorMessageCopyEmailMock,
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

  it('POST /visitors/message -> 204 (no auth required)', async () => {
    postgresQueryMock.mockResolvedValue([
      {
        timezone: 'Asia/Karachi',
      },
    ]);
    sendVisitorMessageCopyEmailMock.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/visitors/message')
      .send({
        anonymous_id: 'anon_123',
        name: 'Muhammad',
        email: 'muhammad@example.com',
        subject: 'Hello',
        phone: '+92-300-0000000',
        message: 'This is a long enough message.',
      })
      .expect(204)
      .expect('');

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    expect(sendVisitorMessageCopyEmailMock).toHaveBeenCalledTimes(1);
    expect(sendVisitorMessageCopyEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Muhammad',
        email: 'muhammad@example.com',
        subject: 'Hello',
        phone: '+92-300-0000000',
        message: 'This is a long enough message.',
        timezone: 'Asia/Karachi',
      }),
    );
  });

  it('POST /visitors/message -> 404 when visitor not found', async () => {
    postgresQueryMock.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post('/visitors/message')
      .send({
        anonymous_id: 'missing_visitor',
        name: 'Muhammad',
        email: 'muhammad@example.com',
        subject: 'Hello',
        phone: '',
        message: 'This is a long enough message.',
      })
      .expect(404);

    expect(sendVisitorMessageCopyEmailMock).not.toHaveBeenCalled();
  });

  it('POST /visitors/message -> 400 when payload invalid', async () => {
    await request(app.getHttpServer())
      .post('/visitors/message')
      .send({
        anonymous_id: '',
        name: 123,
        email: 'not-an-email',
        subject: '',
        message: 'short',
      })
      .expect(400);
  });
});