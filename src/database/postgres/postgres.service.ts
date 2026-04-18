import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../logger/logger.service';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private pool: Pool;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: Logger
  ) {
    this.pool = new Pool({
      user: this.configService.get<string>('POSTGRES_USER'),
      host: this.configService.get<string>('POSTGRES_HOST'),
      database: this.configService.get<string>('POSTGRES_NAME'),
      password: this.configService.get<string>('POSTGRES_PASSWORD'),
      port: this.configService.get<number>('POSTGRES_PORT') ?? 5432,
      max: 10
    });
  }

  private formatQuery(text: string, params?: unknown[]): string {
    if (!params || params.length === 0) {
      return text;
    }

    let formattedQuery: string = text;
    params.forEach((param: unknown, index: number) => {
      const placeholder: string = `$${index + 1}`;
      const formattedParam: string =
        typeof param === 'string' ? `'${param}'` : String(param);
      formattedQuery = formattedQuery.replace(placeholder, formattedParam);
    });
    return formattedQuery;
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const formattedQuery: string = this.formatQuery(text, params);
    this.loggerService.log(`Executing query: ${formattedQuery}`);
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy() : Promise<void> {
    await this.pool.end();
  }
}