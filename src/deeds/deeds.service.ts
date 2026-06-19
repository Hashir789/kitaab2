import { Logger } from '../logger/logger.service';
import { CreateDeedItemDto } from './deeds.dto';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { TransactionClient } from '../database/postgres/postgres.interface';
import { DeedCategoryType, DeedItemQueryInterface, DeedItemResult, DeedQueryInterface } from './deeds.interface';

@Injectable()
export class DeedsService {

  constructor(
    private readonly loggerService: Logger,
    private readonly postgresService: PostgresService
  ) {}

  async createDeedItem(category: string, payload: CreateDeedItemDto, req: AuthenticatedRequest): Promise<DeedItemResult> {
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
      return await this.postgresService.transaction(async (client) => {
        const deed_id = await this.getUserDeedId(client, user_id, category);
        const parent_deed_item_id = payload.parent_deed_item_id ?? null;
        if (parent_deed_item_id !== null) {
          await this.assertParentBelongsToDeed(client, parent_deed_item_id, deed_id);
        }
        return this.insertDeedItemTree(client, deed_id, parent_deed_item_id, payload);
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

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

  private async assertParentBelongsToDeed(client: TransactionClient, parent_deed_item_id: number, deed_id: number): Promise<void> {
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

  private async insertDeedItemTree(client: TransactionClient, deed_id: number, parent_deed_item_id: number | null, payload: CreateDeedItemDto): Promise<DeedItemResult> {
    const [created] = await client.query<DeedItemResult>(`
      INSERT INTO deed_items (deed_id, parent_deed_item_id, name, description, display_order, hide_type)
      VALUES ($1, $2, $3, $4, $5, $6::hide_type_enum)
      RETURNING deed_item_id, deed_id, parent_deed_item_id, name, description, display_order, hide_type, created_at
    `, [deed_id, parent_deed_item_id, payload.name, payload.description ?? null, payload.display_order ?? 0, payload.hide_type ?? 'none']);
    const children = payload.children ?? [];
    if (!children.length) {
      return created;
    }
    created.children = [];
    for (const child of children) {
      if (child.parent_deed_item_id !== undefined) {
        this.loggerService.error('Nested children must not include parent_deed_item_id', HttpStatus.BAD_REQUEST);
        throw new HttpException('Nested children must not include parent_deed_item_id', HttpStatus.BAD_REQUEST);
      }
      created.children.push(await this.insertDeedItemTree(client, deed_id, created.deed_item_id, child));
    }
    return created;
  }
}