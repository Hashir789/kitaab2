import { DeedsService } from './deeds.service';
import { DeedItemResult } from './deeds.interface';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { CreateDeedItemDto, DeedAnalyticsDto, ReorderDeedItemsDto, UpdateDeedItemDto } from './deeds.dto';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';

@Controller('deeds')
export class DeedsController {

  constructor(private readonly deedsService: DeedsService) {}

  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  deedAnalytics(@Query() query: DeedAnalyticsDto) {
    return this.deedsService.deedAnalytics(query);
  }

  @Post(':category/items')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createDeedItem(@Param('category') category: string, @Body() body: CreateDeedItemDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.deedsService.createDeedItem(category, body, req);
  }

  @Get(':category/items')
  async getDeedItems(@Param('category') category: string, @Req() req: AuthenticatedRequest): Promise<DeedItemResult[]> {
    return this.deedsService.getDeedItems(category, req);
  }

  @Patch(':category/items/display-order')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderDeedItems(@Param('category') category: string, @Body() body: ReorderDeedItemsDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.deedsService.reorderDeedItems(category, body, req);
  }

  @Delete(':category/items/:deed_item_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDeedItem(@Param('category') category: string, @Param('deed_item_id', ParseIntPipe) deed_item_id: number, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.deedsService.deleteDeedItem(category, deed_item_id, req);
  }

  @Patch(':category/items/:deed_item_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateDeedItemCategory(@Param('category') category: string, @Param('deed_item_id', ParseIntPipe) deed_item_id: number, @Body() body: UpdateDeedItemDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.deedsService.updateDeedItem(category, deed_item_id, body, req);
  }
}