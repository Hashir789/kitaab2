import { RecordsService } from './records.service';
import { DeedRecordRangeItemResult, RecordResult } from './records.interface';
import { CreateRecordsDto, DeleteRecordsDto, GetRecordsRangeDto } from './records.dto';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';

@Controller('records')
export class RecordsController {

  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async createRecords(@Body() body: CreateRecordsDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.recordsService.createRecords(body, req);
  }

  @Get('range')
  async getRecordsRange(@Query() query: GetRecordsRangeDto, @Req() req: AuthenticatedRequest): Promise<DeedRecordRangeItemResult[]> {
    return this.recordsService.getRecordsRange(query, req);
  }

  @Get(':date')
  async getRecordsByDate(@Param('date') date: string, @Req() req: AuthenticatedRequest): Promise<RecordResult[]> {
    return this.recordsService.getRecordsByDate(date, req);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecords(@Body() body: DeleteRecordsDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.recordsService.deleteRecords(body, req);
  }
}