import { DeedsService } from './deeds.service';
import { CreateDeedItemDto } from './deeds.dto';
import { DeedItemResult } from './deeds.interface';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';

@Controller('deeds')
export class DeedsController {

  constructor(private readonly deedsService: DeedsService) {}

  @Post(':category/items')
  @HttpCode(HttpStatus.CREATED)
  async createDeedItem(@Param('category') category: string, @Body() body: CreateDeedItemDto, @Req() req: AuthenticatedRequest): Promise<DeedItemResult> {
    return this.deedsService.createDeedItem(category, body, req);
  }
}