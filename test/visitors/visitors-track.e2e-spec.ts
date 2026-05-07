import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PostgresService } from '../../src/database/postgres/postgres.service';

describe('VisitorsController (e2e) - POST /visitors/track', () => {
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

  it('POST /visitors/track -> 204 (no auth required)', async () => {
    jest.spyOn(globalThis as any, 'fetch').mockResolvedValue({
      json: async () => ({ city: 'Karachi', country: 'Pakistan' }),
    } as any);
    postgresQueryMock.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post('/visitors/track')
      .send({
        timezone: 'Asia/Karachi',
        anonymous_id: 'anon_123',
        device_type: 'desktop',
      })
      .expect(204)
      .expect('');

    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    expect((globalThis as any).fetch.mock.calls[0][0]).toContain(
      encodeURIComponent('127.0.0.1'),
    );

    expect(postgresQueryMock).toHaveBeenCalledTimes(1);
    const params = postgresQueryMock.mock.calls[0][1];
    expect(params).toEqual([
      'anon_123',
      '127.0.0.1',
      'Karachi',
      'Pakistan',
      'Asia/Karachi',
      'desktop',
    ]);
  });

  it('POST /visitors/track -> 400 when payload invalid', async () => {
    await request(app.getHttpServer())
      .post('/visitors/track')
      .send({
        timezone: '',
        anonymous_id: '',
        device_type: 'tv',
      })
      .expect(400);
  });

  it('POST /visitors/track -> 400 when required fields missing', async () => {
    await request(app.getHttpServer()).post('/visitors/track').send({}).expect(400);
  });
});