import { DeedsService } from './deeds.service';
import { CreateDeedItemDto, ReorderDeedItemsDto } from './deeds.dto';
import { DeedItemResult } from './deeds.interface';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';

@Controller('deeds')
export class DeedsController {

  constructor(private readonly deedsService: DeedsService) {}

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
}