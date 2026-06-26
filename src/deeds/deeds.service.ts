import { Logger } from '../logger/logger.service';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { TransactionClient } from '../database/postgres/postgres.interface';
import { CreateDeedItemDto, ReorderDeedItemsDto, UpdateDeedItemDto } from './deeds.dto';
import { DeedCategoryType, DeedItemQueryInterface, DeedItemResult, DeedQueryInterface, FlatDeedItemNode } from './deeds.interface';

@Injectable()
export class DeedsService {

  constructor(
    private readonly loggerService: Logger,
    private readonly postgresService: PostgresService
  ) {}

  async createDeedItem(category: string, payload: CreateDeedItemDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('createDeedItem {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (!(category === 'hasanaat' || category === 'saiyyiaat')) {
        this.loggerService.error('Invalid deed category', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid deed category', HttpStatus.BAD_REQUEST);
      }
      const flat = this.flattenDeedItemTree(payload, null);
      await this.postgresService.transaction(async (client) => {
        const deed_id = await this.getUserDeedId(client, user_id, category);
        const parent_deed_item_id = payload.parent_deed_item_id ?? null;
        if (parent_deed_item_id !== null) {
          const rows = await client.query<DeedItemQueryInterface>(`
            SELECT deed_item_id
            FROM deed_items
            WHERE deed_item_id = $1
              AND deed_id = $2
          `, [parent_deed_item_id, deed_id]);
          if (!rows?.length) {
            this.loggerService.error('Parent deed item not found', HttpStatus.NOT_FOUND);
            throw new HttpException('Parent deed item not found', HttpStatus.NOT_FOUND);
          }
        }
        await this.bulkInsertDeedItemTree(client, deed_id, parent_deed_item_id, flat);
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async reorderDeedItems(category: string, payload: ReorderDeedItemsDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('reorderDeedItems {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (!(category === 'hasanaat' || category === 'saiyyiaat')) {
        this.loggerService.error('Invalid deed category', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid deed category', HttpStatus.BAD_REQUEST);
      }
      const { display_order: ids, parent_deed_item_id } = payload;
      if (new Set(ids).size !== ids.length) {
        this.loggerService.error('Duplicate deed item ids in display_order', HttpStatus.BAD_REQUEST);
        throw new HttpException('Duplicate deed item ids in display_order', HttpStatus.BAD_REQUEST);
      }
      return await this.postgresService.transaction(async (client) => {
        const deed_id = await this.getUserDeedId(client, user_id, category);
        const rows = await client.query<DeedItemQueryInterface>(`
          SELECT deed_item_id
          FROM deed_items
          WHERE deed_id = $1
            AND parent_deed_item_id IS NOT DISTINCT FROM $3
            AND deed_item_id = ANY($2::bigint[])
        `, [deed_id, ids, parent_deed_item_id]);
        if (rows.length !== ids.length) {
          this.loggerService.error('One or more level-1 deed items not found', HttpStatus.NOT_FOUND);
          throw new HttpException('One or more level-1 deed items not found', HttpStatus.NOT_FOUND);
        }
        await client.query(`
          UPDATE deed_items di
          SET display_order = ordering.idx - 1
          FROM unnest($2::bigint[]) WITH ORDINALITY AS ordering(deed_item_id, idx)
          WHERE di.deed_item_id = ordering.deed_item_id
            AND di.deed_id = $1
            AND di.parent_deed_item_id IS NOT DISTINCT FROM $3
        `, [deed_id, ids, parent_deed_item_id]);
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteDeedItem(category: string, deed_item_id: number, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('deleteDeedItem {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (!(category === 'hasanaat' || category === 'saiyyiaat')) {
        this.loggerService.error('Invalid deed category', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid deed category', HttpStatus.BAD_REQUEST);
      }
      await this.postgresService.transaction(async (client) => {
        const deed_id = await this.getUserDeedId(client, user_id, category);
        const rows = await client.query<DeedItemQueryInterface>(`
          DELETE FROM deed_items
          WHERE deed_item_id = $1
            AND deed_id = $2
          RETURNING deed_item_id
        `, [deed_item_id, deed_id]);
        if (!rows?.length) {
          this.loggerService.error('Deed item not found', HttpStatus.NOT_FOUND);
          throw new HttpException('Deed item not found', HttpStatus.NOT_FOUND);
        }
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getDeedItems(category: string, req: AuthenticatedRequest): Promise<DeedItemResult[]> {
    try {
      this.loggerService.log('getDeedItems {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (!(category === 'hasanaat' || category === 'saiyyiaat')) {
        this.loggerService.error('Invalid deed category', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid deed category', HttpStatus.BAD_REQUEST);
      }
      const deed_id = await this.getUserDeedId(this.postgresService, user_id, category);
      const rows = await this.postgresService.query<DeedItemResult>(`
        SELECT deed_item_id, deed_id, parent_deed_item_id, name, description, display_order, hide_type, created_at
        FROM deed_items
        WHERE deed_id = $1
        ORDER BY display_order ASC, deed_item_id ASC
      `, [deed_id]);
      const itemsById = new Map<number, DeedItemResult>();
      const roots: DeedItemResult[] = [];
      for (const row of rows) {
        itemsById.set(row.deed_item_id, { ...row });
      }
      for (const item of itemsById.values()) {
        if (item.parent_deed_item_id === null) {
          roots.push(item);
          continue;
        }
        const parent = itemsById.get(item.parent_deed_item_id);
        if (!parent) {
          roots.push(item);
          continue;
        }
        parent.children ??= [];
        parent.children.push(item);
      }
      return roots;
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateDeedItem(category: string, deed_item_id: number, payload: UpdateDeedItemDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('updateDeedItem {controller}');
      const { name, description, hide_type } = payload;
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (!(category === 'hasanaat' || category === 'saiyyiaat')) {
        this.loggerService.error('Invalid deed category', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid deed category', HttpStatus.BAD_REQUEST);
      }
      if (!name && !description && !hide_type) {
        this.loggerService.error('Nothing to update', HttpStatus.BAD_REQUEST);
        throw new HttpException('Nothing to update', HttpStatus.BAD_REQUEST);
      }
      await this.postgresService.transaction(async (client) => {
        const deed_id = await this.getUserDeedId(client, user_id, category as DeedCategoryType);
        const updates: string[] = [];
        const params: any[] = [];
        let index = 1;
        if (name) {
          updates.push(`name = $${index++}`);
          params.push(name);
        }
        if (description) {
          updates.push(`description = $${index++}`);
          params.push(description);
        }
        if (hide_type) {
          updates.push(`hide_type = $${index++}`);
          params.push(hide_type);
        }
        params.push(deed_item_id);
        params.push(deed_id);
        const rows = await client.query<{ deed_item_id: number }>(`
          UPDATE deed_items
          SET ${updates.join(', ')}
          WHERE deed_item_id = $${index++}
            AND deed_id = $${index}
          RETURNING deed_item_id
        `, params);
        if (!rows.length) {
          this.loggerService.error('Deed item not found', HttpStatus.NOT_FOUND);
          throw new HttpException('Deed item not found', HttpStatus.NOT_FOUND);
        }
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // helper functions

  private async getUserDeedId(client: TransactionClient, user_id: number, category: DeedCategoryType): Promise<number> {
    const rows = await client.query<DeedQueryInterface>(`
      SELECT deed_id
      FROM deeds
      WHERE user_id = $1
        AND category_type = $2::deed_category_type
    `, [user_id, category]);
    if (!rows?.length) {
      this.loggerService.error('Deed category not found', HttpStatus.NOT_FOUND);
      throw new HttpException('Deed category not found', HttpStatus.NOT_FOUND);
    }
    return rows[0].deed_id;
  }

  private flattenDeedItemTree(payload: CreateDeedItemDto, parent_index: number | null, flat: Omit<FlatDeedItemNode, 'index'>[] = []): FlatDeedItemNode[] {
    if (parent_index !== null && payload.parent_deed_item_id !== undefined) {
      this.loggerService.error('Nested children must not include parent_deed_item_id', HttpStatus.BAD_REQUEST);
      throw new HttpException('Nested children must not include parent_deed_item_id', HttpStatus.BAD_REQUEST);
    }

    const { name, description, display_order, hide_type } = payload;
    const current_index = flat.length;
    flat.push({
      parent_index,
      name,
      description: description ?? null,
      display_order: display_order ?? 0,
      hide_type: hide_type ?? 'none',
    });

    for (const child of payload.children ?? []) {
      this.flattenDeedItemTree(child, current_index, flat);
    }

    return flat.map((node, index) => ({ ...node, index }));
  }

  private async bulkInsertDeedItemTree(client: TransactionClient, deed_id: number, root_parent_id: number | null, flat: FlatDeedItemNode[]): Promise<void> {
    const depth_by_index = new Map<number, number>();
    const levels: FlatDeedItemNode[][] = [];

    for (const node of flat) {
      const depth = node.parent_index === null ? 0 : depth_by_index.get(node.parent_index)! + 1;
      depth_by_index.set(node.index, depth);
      (levels[depth] ??= []).push(node);
    }

    if (!levels.length) {
      return;
    }

    const params: unknown[] = [deed_id];
    let param_index = 2;
    const next_param = (value: unknown): string => {
      params.push(value);
      return `$${param_index++}`;
    };

    const ctes: string[] = [];

    for (let depth = 0; depth < levels.length; depth++) {
      const level = levels[depth];
      const level_cte = `level_${depth}`;
      const map_cte = `level_${depth}_map`;

      if (depth === 0) {
        const root = level[0];
        const parent_param = next_param(root_parent_id);
        const name_param = next_param(root.name);
        const description_param = next_param(root.description);
        const display_order_param = next_param(root.display_order);
        const hide_type_param = next_param(root.hide_type);

        ctes.push(`
          ${level_cte} AS (
            INSERT INTO deed_items (deed_id, parent_deed_item_id, name, description, display_order, hide_type)
            VALUES ($1, ${parent_param}, ${name_param}, ${description_param}, ${display_order_param}, ${hide_type_param}::hide_type_enum)
            RETURNING deed_item_id
          ),
          ${map_cte} AS (
            SELECT deed_item_id, ${root.index}::int AS node_index
            FROM ${level_cte}
          )
        `);
        continue;
      }

      const parent_indices_param = next_param(level.map((node) => node.parent_index));
      const names_param = next_param(level.map((node) => node.name));
      const descriptions_param = next_param(level.map((node) => node.description));
      const display_orders_param = next_param(level.map((node) => node.display_order));
      const hide_types_param = next_param(level.map((node) => node.hide_type));
      const node_indices_param = next_param(level.map((node) => node.index));
      const parent_map_cte = `level_${depth - 1}_map`;

      ctes.push(`
        ${level_cte} AS (
          INSERT INTO deed_items (deed_id, parent_deed_item_id, name, description, display_order, hide_type)
          SELECT
            $1,
            parents.deed_item_id,
            rows.name,
            rows.description,
            rows.display_order,
            rows.hide_type::hide_type_enum
          FROM unnest(
            ${parent_indices_param}::int[],
            ${names_param}::text[],
            ${descriptions_param}::text[],
            ${display_orders_param}::int[],
            ${hide_types_param}::text[]
          ) AS rows(parent_index, name, description, display_order, hide_type)
          INNER JOIN ${parent_map_cte} parents ON parents.node_index = rows.parent_index
          RETURNING deed_item_id
        ),
        ${map_cte} AS (
          SELECT inserted.deed_item_id, indices.node_index
          FROM (
            SELECT deed_item_id, row_number() OVER () AS rn
            FROM ${level_cte}
          ) inserted
          INNER JOIN (
            SELECT node_index, row_number() OVER () AS rn
            FROM unnest(${node_indices_param}::int[]) AS t(node_index)
          ) indices ON indices.rn = inserted.rn
        )
      `);
    }

    await client.query(`WITH ${ctes.join(',\n')} SELECT 1`, params);
  }
}