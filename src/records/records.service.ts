import { Logger } from '../logger/logger.service';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { PostgresService } from '../database/postgres/postgres.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateRecordsDto, DeleteRecordsDto, GetRecordsRangeDto } from './records.dto';
import { DailyCountStatResult, DeedItemOwnerQueryInterface, DeedRecordRangeItemResult, DeedScaleRow, InternalDeedNode, RecordResult, RecordRow, ScaleItemOwnerQueryInterface, ScaleItemStatResult } from './records.interface';

@Injectable()
export class RecordsService {

  constructor(
    private readonly loggerService: Logger,
    private readonly postgresService: PostgresService
  ) { }

  async createRecords(payload: CreateRecordsDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('createRecords {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }

      const { records } = payload;
      for (const record of records) {
        const hasScale = record.scale_item_id !== undefined && record.scale_item_id !== null;
        const hasCount = record.count_value !== undefined && record.count_value !== null;
        if ((hasScale && hasCount) || (!hasScale && !hasCount)) {
          this.loggerService.error('Record must contain either scale_item_id or count_value', HttpStatus.BAD_REQUEST);
          throw new HttpException('Record must contain either scale_item_id or count_value', HttpStatus.BAD_REQUEST);
        }
      }

      const deedItemIds = [...new Set(records.map((r) => r.deed_item_id))];
      const scaleItemIds = [...new Set(records.map((r) => r.scale_item_id).filter((id): id is number => id !== undefined && id !== null))];

      await this.postgresService.transaction(async (client) => {
        const deedRows = await client.query<DeedItemOwnerQueryInterface>(`
          SELECT di.deed_item_id
          FROM deed_items di
          INNER JOIN deeds d ON d.deed_id = di.deed_id
          WHERE d.user_id = $1
            AND di.deed_item_id = ANY($2::bigint[])
        `, [user_id, deedItemIds]);

        if (deedRows.length !== deedItemIds.length) {
          this.loggerService.error('One or more deed items not found', HttpStatus.NOT_FOUND);
          throw new HttpException('One or more deed items not found', HttpStatus.NOT_FOUND);
        }

        if (scaleItemIds.length > 0) {
          const scaleRows = await client.query<ScaleItemOwnerQueryInterface>(`
            SELECT si.scale_items_id
            FROM scale_items si
            WHERE si.scale_items_id = ANY($1::bigint[])
          `, [scaleItemIds]);

          if (scaleRows.length !== scaleItemIds.length) {
            this.loggerService.error('One or more scale items not found', HttpStatus.NOT_FOUND);
            throw new HttpException('One or more scale items not found', HttpStatus.NOT_FOUND);
          }
        }

        await client.query(`
          INSERT INTO records (user_id, deed_item_id, date, scale_item_id, count_value)
          SELECT
            $1,
            rows.deed_item_id,
            rows.date,
            rows.scale_item_id,
            rows.count_value
          FROM unnest(
            $2::bigint[],
            $3::date[],
            $4::bigint[],
            $5::numeric[]
          ) AS rows(deed_item_id, date, scale_item_id, count_value)
          ON CONFLICT (user_id, deed_item_id, date)
          DO UPDATE SET
            scale_item_id = EXCLUDED.scale_item_id,
            count_value = EXCLUDED.count_value
        `, [
          user_id,
          records.map((r) => r.deed_item_id),
          records.map((r) => r.date),
          records.map((r) => r.scale_item_id ?? null),
          records.map((r) => r.count_value ?? null)
        ]);
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getRecordsByDate(date: string, req: AuthenticatedRequest): Promise<RecordResult[]> {
    try {
      this.loggerService.log('getRecordsByDate {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
        this.loggerService.error('Invalid date format', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
      }

      return await this.postgresService.query<RecordResult>(`
        SELECT record_id, user_id, deed_item_id, date, scale_item_id, count_value, created_at
        FROM records
        WHERE user_id = $1
          AND date = $2::date
        ORDER BY record_id ASC
      `, [user_id, date]);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteRecords(payload: DeleteRecordsDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('deleteRecords {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }

      const { record_ids } = payload;
      if (new Set(record_ids).size !== record_ids.length) {
        this.loggerService.error('Duplicate record ids in payload', HttpStatus.BAD_REQUEST);
        throw new HttpException('Duplicate record ids in payload', HttpStatus.BAD_REQUEST);
      }

      await this.postgresService.transaction(async (client) => {
        const rows = await client.query<{ record_id: number }>(`
          DELETE FROM records
          WHERE user_id = $1
            AND record_id = ANY($2::bigint[])
          RETURNING record_id
        `, [user_id, record_ids]);

        if (rows.length !== record_ids.length) {
          this.loggerService.error('One or more records not found', HttpStatus.NOT_FOUND);
          throw new HttpException('One or more records not found', HttpStatus.NOT_FOUND);
        }
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getRecordsRange(query: GetRecordsRangeDto, req: AuthenticatedRequest): Promise<DeedRecordRangeItemResult[]> {
    try {
      this.loggerService.log('getRecordsRange {controller}');
      const { sub: user_id, type: token_type } = req.user;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }

      const { start_date, end_date } = query;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || isNaN(Date.parse(start_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date) || isNaN(Date.parse(end_date))) {
        this.loggerService.error('Invalid date format', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
      }

      if (start_date > end_date) {
        this.loggerService.error('start_date must not be greater than end_date', HttpStatus.BAD_REQUEST);
        throw new HttpException('start_date must not be greater than end_date', HttpStatus.BAD_REQUEST);
      }

      const [deedRows, recordRows] = await Promise.all([
        this.postgresService.query<DeedScaleRow>(`
          SELECT
            di.deed_item_id,
            di.parent_deed_item_id,
            di.name,
            di.display_order,
            COALESCE(
              di.type,
              parent.type,
              CASE WHEN s.scale_id IS NOT NULL THEN 'scale' ELSE NULL END
            ) AS type,
            si.scale_items_id,
            si.name AS scale_item_name,
            si.display_order AS scale_item_display_order
          FROM deed_items di
          INNER JOIN deeds d ON d.deed_id = di.deed_id
          LEFT JOIN deed_items parent ON parent.deed_item_id = di.parent_deed_item_id
          LEFT JOIN scales s ON s.deed_item_id = COALESCE(di.parent_deed_item_id, di.deed_item_id)
          LEFT JOIN scale_items si ON si.scale_id = s.scale_id
          WHERE d.user_id = $1
          ORDER BY di.display_order ASC, di.deed_item_id ASC, si.display_order ASC, si.scale_items_id ASC
        `, [user_id]),
        this.postgresService.query<RecordRow>(`
          SELECT
            r.deed_item_id,
            TO_CHAR(r.date, 'YYYY-MM-DD') AS date,
            r.scale_item_id,
            r.count_value
          FROM records r
          WHERE r.user_id = $1
            AND r.date >= $2::date
            AND r.date <= $3::date
          ORDER BY r.date ASC, r.record_id ASC
        `, [user_id, start_date, end_date])
      ]);

      const itemsById = new Map<number, InternalDeedNode>();

      for (const row of deedRows) {
        const deedItemId = Number(row.deed_item_id);
        const parentDeedItemId = row.parent_deed_item_id !== null && row.parent_deed_item_id !== undefined
          ? Number(row.parent_deed_item_id)
          : null;

        let node = itemsById.get(deedItemId);
        if (!node) {
          node = {
            children: [],
            type: row.type ?? null,
            name: row.name,
            scaleItems: new Map(),
            deed_item_id: deedItemId,
            directScaleCounts: new Map(),
            directDailyCounts: new Map(),
            aggregatedScaleCounts: new Map(),
            aggregatedDailyCounts: new Map(),
            parent_deed_item_id: parentDeedItemId,
            display_order: Number(row.display_order)
          };
          itemsById.set(deedItemId, node);
        }

        if (row.scale_items_id !== null && row.scale_items_id !== undefined && row.scale_item_name !== null) {
          const scaleItemId = Number(row.scale_items_id);
          node.scaleItems.set(scaleItemId, {
            name: row.scale_item_name,
            scale_item_id: scaleItemId
          });
          if (!node.type) node.type = 'scale';
        }
      }

      for (const r of recordRows) {
        const deedItemId = Number(r.deed_item_id);
        const node = itemsById.get(deedItemId);
        if (!node) continue;

        if (r.scale_item_id !== null && r.scale_item_id !== undefined) {
          const sid = Number(r.scale_item_id);
          node.directScaleCounts.set(sid, (node.directScaleCounts.get(sid) ?? 0) + 1);
          if (!node.type) node.type = 'scale';
        }

        if (r.count_value !== null && r.count_value !== undefined) {
          const dateStr = r.date;
          node.directDailyCounts.set(dateStr, (node.directDailyCounts.get(dateStr) ?? 0) + Number(r.count_value));
          if (!node.type) node.type = 'count';
        }
      }

      const roots: InternalDeedNode[] = [];
      for (const item of itemsById.values()) {
        if (item.parent_deed_item_id === null) {
          roots.push(item);
          continue;
        }
        const parent = itemsById.get(item.parent_deed_item_id);
        if (parent)
          parent.children.push(item);
        else
          roots.push(item);
      }

      const syncTreeMeta = (node: InternalDeedNode, parentType: 'scale' | 'count' | null, parentScaleItems?: Map<number, { scale_item_id: number; name: string }>): void => {
        if (!node.type && parentType) {
          node.type = parentType;
        }

        if (parentScaleItems && parentScaleItems.size > 0 && node.scaleItems.size === 0) {
          node.scaleItems = new Map(parentScaleItems);
        }

        for (const child of node.children) {
          syncTreeMeta(child, node.type, node.scaleItems);
          if (!node.type && child.type) {
            node.type = child.type;
          }
          if (node.scaleItems.size === 0 && child.scaleItems.size > 0) {
            node.scaleItems = new Map(child.scaleItems);
          }
        }

        if (node.scaleItems.size > 0) {
          for (const child of node.children) {
            if (child.scaleItems.size === 0) {
              child.scaleItems = new Map(node.scaleItems);
            }
            if (!child.type && node.type) {
              child.type = node.type;
            }
          }
        }
      };

      for (const root of roots) {
        syncTreeMeta(root, root.type, root.scaleItems);
      }

      const computeAndFormat = (node: InternalDeedNode): DeedRecordRangeItemResult => {
        const formattedChildren: DeedRecordRangeItemResult[] = [];
        for (const child of node.children)
          formattedChildren.push(computeAndFormat(child));

        let total = 0;
        let scales: ScaleItemStatResult[] | null = null;
        let daily_counts: DailyCountStatResult[] | null = null;

        if (node.type === 'scale') {
          node.aggregatedScaleCounts = new Map();
          for (const [scaleId] of node.scaleItems)
            node.aggregatedScaleCounts.set(scaleId, node.directScaleCounts.get(scaleId) ?? 0);

          for (const child of node.children)
            for (const [scaleId, cnt] of child.aggregatedScaleCounts)
              node.aggregatedScaleCounts.set(scaleId, (node.aggregatedScaleCounts.get(scaleId) ?? 0) + cnt);

          for (const cnt of node.aggregatedScaleCounts.values())
            total += cnt;

          scales = Array.from(node.scaleItems.values()).map((scaleMeta) => {
            const count = node.aggregatedScaleCounts.get(scaleMeta.scale_item_id) ?? 0;
            const percentage = total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
            return {
              scale_item_id: scaleMeta.scale_item_id,
              name: scaleMeta.name,
              count,
              percentage
            };
          });
        } else if (node.type === 'count') {
          node.aggregatedDailyCounts = new Map(node.directDailyCounts);
          for (const child of node.children)
            for (const [date, cnt] of child.aggregatedDailyCounts)
              node.aggregatedDailyCounts.set(date, (node.aggregatedDailyCounts.get(date) ?? 0) + cnt);

          const sortedDates = Array.from(node.aggregatedDailyCounts.entries()).sort((a, b) =>
            a[0].localeCompare(b[0])
          );

          daily_counts = sortedDates.map(([date, count]) => {
            total += count;
            return { date, count };
          });
        }

        const result: DeedRecordRangeItemResult = {
          total,
          scales,
          daily_counts,
          name: node.name,
          type: node.type,
          deed_item_id: node.deed_item_id
        };

        if (formattedChildren.length > 0)
          result.children = formattedChildren;

        return result;
      };

      return roots.map(computeAndFormat);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}