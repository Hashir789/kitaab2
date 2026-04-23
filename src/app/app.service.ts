import { Logger } from '../logger/logger.service';
import { TrackVisitorsDto } from './dto/TrackVisitors.dto';
import { VisitorMessagesDto } from './dto/VisitorMessages.dto';
import { RedisService } from '../database/redis/redis.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { TrackVisitorsQueryInterface } from './interface/TrackVisitors.interface';
import { LookupGeoForIpBody, LookupGeoForIpResult } from './interface/LookupGeoForIp.interface';
import { CheckDatabaseConnectionsResponseInterface } from './interface/CheckDatabaseConnections.interface';

@Injectable()
export class AppService {

  constructor(
    private readonly loggerService: Logger,
    private readonly redisService: RedisService,
    private readonly postgresService: PostgresService
  ) {}
  
  // controller functions

  healthCheck() {
    this.loggerService.log('healthCheck {controller}');
  }
  
  async checkDatabaseConnections(): Promise<{ data: CheckDatabaseConnectionsResponseInterface, statusCode: 200}> {
    try {
      this.loggerService.log('checkDatabaseConnections {controller}');
      const [postgres, redis] = await Promise.allSettled([ this.tryPostgres(), this.tryRedis() ]);
      return {
        data: {
          redis: redis.status === 'fulfilled',
          postgres: postgres.status === 'fulfilled',
        },
        statusCode: 200
      };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  async trackVisitor(payload: TrackVisitorsDto, ip: string): Promise<void> {
    try {
      const { timezone, anonymous_id, device_type } = payload;
      const clientIp = this.normalizeClientIp(ip);
      const { city, country } = await this.lookupGeoForIp({ ip: clientIp, timezone });
      await this.postgresService.query<TrackVisitorsQueryInterface>(`
        INSERT INTO visitors (anonymous_id, ip, city, country, timezone, device_type)
        VALUES ($1, $2::inet, $3, $4, $5, $6)
        ON CONFLICT (anonymous_id)
        DO UPDATE SET
          ip = EXCLUDED.ip,
          city = EXCLUDED.city,
          country = EXCLUDED.country,
          timezone = EXCLUDED.timezone,
          device_type = EXCLUDED.device_type,
          number_of_visits = visitors.number_of_visits + 1,
          last_visited = NOW()
        `, [anonymous_id, clientIp, city, country, timezone, device_type]
      );
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException('Failed to record visitor', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async visitorMessages(payload: VisitorMessagesDto): Promise<void> {
    try {
      const { anonymous_id, name, email, phone, message } = payload;
      await this.postgresService.query<TrackVisitorsQueryInterface>(`
        INSERT INTO visitor_messages (visitor_id, name, email, phone, message)
        SELECT v.id, $1, $2, $3, $4
        FROM visitors v
        WHERE v.anonymous_id = $5;
        `, [name, email, phone, message, anonymous_id]
      );
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException('Failed to record visitor', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // helper functions
  
  private async tryPostgres(): Promise<void> {
    this.loggerService.log('tryPostgres {helper}');
    await this.postgresService.ping();
  }
  
  private async tryRedis(): Promise<void> {
    this.loggerService.log('tryRedis {helper}');
    await this.redisService.ping();
  }
  
  private async lookupGeoForIp(body: LookupGeoForIpBody): Promise<LookupGeoForIpResult> {
    this.loggerService.log('lookupGeoForIp {helper}');
    const url = `http://ip-api.com/json/${encodeURIComponent(body.ip)}`;
    const response = await fetch(url);
    const data = await response.json();
    return {
      city: data.city,
      country: data.country
    };
  }

  private normalizeClientIp(ip: string): string {
    return ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/i, '');
  }
}