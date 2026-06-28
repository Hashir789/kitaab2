import { ScalesService } from './scales.service';
import { CreateScaleItemsDto } from './scales.dto';
import { ScaleItemResult } from './scales.interface';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Req } from '@nestjs/common';

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
}