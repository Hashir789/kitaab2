import { RecordsService } from './records.service';
import { CreateRecordsDto } from './records.dto';
import { RecordResult } from './records.interface';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';

@Controller('records')
export class RecordsController {

  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async createRecords(@Body() body: CreateRecordsDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.recordsService.createRecords(body, req);
  }

  @Get(':date')
  async getRecordsByDate(@Param('date') date: string, @Req() req: AuthenticatedRequest): Promise<RecordResult[]> {
    return this.recordsService.getRecordsByDate(date, req);
  }
}