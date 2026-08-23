import { Logger } from '../logger/logger.service';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { CreateScaleItemsDto, ReorderScaleItemsDto, UpdateScaleItemDto } from './scales.dto';
import { DeedItemQueryInterface, ScaleItemQueryInterface, ScaleItemResult, ScaleQueryInterface } from './scales.interface';

@Injectable()
export class ScalesService {

  constructor(
    private readonly loggerService: Logger,
    private readonly postgresService: PostgresService
  ) { }

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
          items.map((item) => item.display_order ?? 0)
        ]);
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async reorderScaleItems(deed_item_id: number, payload: ReorderScaleItemsDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('reorderScaleItems {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      const { display_order: ids } = payload;
      if (new Set(ids).size !== ids.length) {
        this.loggerService.error('Duplicate scale item ids in display_order', HttpStatus.BAD_REQUEST);
        throw new HttpException('Duplicate scale item ids in display_order', HttpStatus.BAD_REQUEST);
      }
      return await this.postgresService.transaction(async (client) => {
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

        const scaleItemRows = await client.query<ScaleItemQueryInterface>(`
          SELECT si.scale_items_id
          FROM scale_items si
          INNER JOIN scales s ON s.scale_id = si.scale_id
          WHERE s.deed_item_id = $1
            AND si.scale_items_id = ANY($2::bigint[])
        `, [deed_item_id, ids]);
        if (scaleItemRows.length !== ids.length) {
          this.loggerService.error('One or more scale items not found', HttpStatus.NOT_FOUND);
          throw new HttpException('One or more scale items not found', HttpStatus.NOT_FOUND);
        }

        await client.query(`
          UPDATE scale_items si
          SET display_order = array_position($2::bigint[], si.scale_items_id) + 10000
          FROM scales s
          WHERE s.scale_id = si.scale_id
            AND s.deed_item_id = $1
            AND si.scale_items_id = ANY($2::bigint[])
        `, [deed_item_id, ids]);

        await client.query(`
          UPDATE scale_items si
          SET display_order = array_position($2::bigint[], si.scale_items_id)
          FROM scales s
          WHERE s.scale_id = si.scale_id
            AND s.deed_item_id = $1
            AND si.scale_items_id = ANY($2::bigint[])
        `, [deed_item_id, ids]);
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

  async deleteScaleItem(deed_item_id: number, scale_item_id: number, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('deleteScaleItem {controller}');
      const { sub: user_id, type: token_type } = req.user;
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
        const deleteRows = await client.query<ScaleItemQueryInterface>(`
          DELETE FROM scale_items
          WHERE scale_items_id = $1
            AND scale_id IN (
              SELECT scale_id
              FROM scales
              WHERE deed_item_id = $2
            )
          RETURNING scale_items_id
        `, [scale_item_id, deed_item_id]);
        if (!deleteRows?.length) {
          this.loggerService.error('Scale item not found', HttpStatus.NOT_FOUND);
          throw new HttpException('Scale item not found', HttpStatus.NOT_FOUND);
        }
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateScaleItem(deed_item_id: number, scale_item_id: number, payload: UpdateScaleItemDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('updateScaleItem {controller}');
      const { name, description } = payload;
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (name === undefined && description === undefined) {
        this.loggerService.error('Nothing to update', HttpStatus.BAD_REQUEST);
        throw new HttpException('Nothing to update', HttpStatus.BAD_REQUEST);
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
        const updates: string[] = [];
        const params: any[] = [];
        let index = 1;
        if (name !== undefined) {
          updates.push(`name = $${index++}`);
          params.push(name);
        }
        if (description !== undefined) {
          updates.push(`description = $${index++}`);
          params.push(description);
        }
        params.push(scale_item_id);
        const scaleItemParamIndex = index++;
        params.push(deed_item_id);
        const deedItemParamIndex = index;

        const updateRows = await client.query<ScaleItemQueryInterface>(`
          UPDATE scale_items
          SET ${updates.join(', ')}
          WHERE scale_items_id = $${scaleItemParamIndex}
            AND scale_id IN (
              SELECT scale_id
              FROM scales
              WHERE deed_item_id = $${deedItemParamIndex}
            )
          RETURNING scale_items_id
        `, params);
        if (!updateRows?.length) {
          this.loggerService.error('Scale item not found', HttpStatus.NOT_FOUND);
          throw new HttpException('Scale item not found', HttpStatus.NOT_FOUND);
        }
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
};