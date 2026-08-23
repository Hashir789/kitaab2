import { ScalesService } from './scales.service';
import { ScaleItemResult } from './scales.interface';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { CreateScaleItemsDto, ReorderScaleItemsDto, UpdateScaleItemDto } from './scales.dto';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';

@Controller('scales')
export class ScalesController {

  constructor(private readonly scalesService: ScalesService) {}

  @Get(':deed_item_id/items')
  async getScaleItems(@Param('deed_item_id', ParseIntPipe) deed_item_id: number, @Req() req: AuthenticatedRequest): Promise<ScaleItemResult[]> {
    return this.scalesService.getScaleItems(deed_item_id, req);
  }

  @Post(':deed_item_id/items')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createScaleItems(@Param('deed_item_id', ParseIntPipe) deed_item_id: number, @Body() body: CreateScaleItemsDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.scalesService.createScaleItems(deed_item_id, body, req);
  }

  @Patch(':deed_item_id/items/display-order')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderScaleItems(@Param('deed_item_id', ParseIntPipe) deed_item_id: number, @Body() body: ReorderScaleItemsDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.scalesService.reorderScaleItems(deed_item_id, body, req);
  }

  @Delete(':deed_item_id/items/:scale_item_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteScaleItem(@Param('deed_item_id', ParseIntPipe) deed_item_id: number, @Param('scale_item_id', ParseIntPipe) scale_item_id: number, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.scalesService.deleteScaleItem(deed_item_id, scale_item_id, req);
  }

  @Patch(':deed_item_id/items/:scale_item_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateScaleItem(@Param('deed_item_id', ParseIntPipe) deed_item_id: number, @Param('scale_item_id', ParseIntPipe) scale_item_id: number, @Body() body: UpdateScaleItemDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.scalesService.updateScaleItem(deed_item_id, scale_item_id, body, req);
  }
}