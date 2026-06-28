import { Logger } from '../logger/logger.service';
import { CreateScaleItemsDto } from './scales.dto';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { DeedItemQueryInterface, ScaleItemResult, ScaleQueryInterface } from './scales.interface';

@Injectable()
export class ScalesService {

  constructor(
    private readonly loggerService: Logger,
    private readonly postgresService: PostgresService
  ) {}

  async createScaleItems(deed_item_id: number, payload: CreateScaleItemsDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('createScaleItem {controller}');
      const { sub: user_id, type: token_type } = req.user;
      const { items } = payload;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      await this.postgresService.transaction(async (client) => {
        const rows = await client.query<DeedItemQueryInterface>(`
          SELECT di.deed_item_id
          FROM deed_items di
          INNER JOIN deeds d ON d.deed_id = di.deed_id
          WHERE di.deed_item_id = $1
            AND di.parent_deed_item_id IS NULL
            AND d.user_id = $2
        `, [deed_item_id, user_id]);
        if (!rows?.length) {
          const nestedRows = await client.query<DeedItemQueryInterface>(`
            SELECT di.deed_item_id
            FROM deed_items di
            INNER JOIN deeds d ON d.deed_id = di.deed_id
            WHERE di.deed_item_id = $1
              AND d.user_id = $2
          `, [deed_item_id, user_id]);
          if (nestedRows?.length) {
            this.loggerService.error('Scale can only be assigned to root deed items', HttpStatus.BAD_REQUEST);
            throw new HttpException('Scale can only be assigned to root deed items', HttpStatus.BAD_REQUEST);
          }
          this.loggerService.error('Root deed item not found', HttpStatus.NOT_FOUND);
          throw new HttpException('Root deed item not found', HttpStatus.NOT_FOUND);
        }
        const scaleRows = await client.query<ScaleQueryInterface>(`
          SELECT scale_id
          FROM scales
          WHERE deed_item_id = $1
        `, [deed_item_id]);
        let scale_id: number;
        if (scaleRows?.length) {
          scale_id = scaleRows[0].scale_id;
        } else {
          const insertedScaleRows = await client.query<ScaleQueryInterface>(`
            INSERT INTO scales (deed_item_id)
            VALUES ($1)
            RETURNING scale_id
          `, [deed_item_id]);
          scale_id = insertedScaleRows[0].scale_id;
        }
        await client.query(`
          INSERT INTO scale_items (scale_id, name, description, display_order)
          SELECT
            $1,
            rows.name,
            rows.description,
            rows.display_order
          FROM unnest(
            $2::text[],
            $3::text[],
            $4::int[]
          ) AS rows(name, description, display_order)
        `, [
          scale_id,
          items.map((item) => item.name),
          items.map((item) => item.description ?? null),
          items.map((item) => item.display_order),
        ]);
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getScaleItems(deed_item_id: number, req: AuthenticatedRequest): Promise<ScaleItemResult[]> {
    try {
      this.loggerService.log('getScaleItems {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      const rows = await this.postgresService.query<DeedItemQueryInterface>(`
        SELECT di.deed_item_id
        FROM deed_items di
        INNER JOIN deeds d ON d.deed_id = di.deed_id
        WHERE di.deed_item_id = $1
          AND di.parent_deed_item_id IS NULL
          AND d.user_id = $2
      `, [deed_item_id, user_id]);
      if (!rows?.length) {
        const nestedRows = await this.postgresService.query<DeedItemQueryInterface>(`
          SELECT di.deed_item_id
          FROM deed_items di
          INNER JOIN deeds d ON d.deed_id = di.deed_id
          WHERE di.deed_item_id = $1
            AND d.user_id = $2
        `, [deed_item_id, user_id]);
        if (nestedRows?.length) {
          this.loggerService.error('Scale can only be assigned to root deed items', HttpStatus.BAD_REQUEST);
          throw new HttpException('Scale can only be assigned to root deed items', HttpStatus.BAD_REQUEST);
        }
        this.loggerService.error('Root deed item not found', HttpStatus.NOT_FOUND);
        throw new HttpException('Root deed item not found', HttpStatus.NOT_FOUND);
      }
      return await this.postgresService.query<ScaleItemResult>(`
        SELECT si.scale_items_id, si.scale_id, si.name, si.description, si.display_order, si.created_at
        FROM scale_items si
        INNER JOIN scales s ON s.scale_id = si.scale_id
        WHERE s.deed_item_id = $1
        ORDER BY si.display_order ASC, si.scale_items_id ASC
      `, [deed_item_id]);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
