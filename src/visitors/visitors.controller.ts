import { VisitorService } from './visitors.service';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { TrackVisitorsDto, VisitorAnalyticsDto, VisitorEmailsDto, VisitorMessagesDto } from './visitors.dto';

@Controller('visitors')
export class VisitorsController {
  
  constructor(private readonly visitorService: VisitorService) {}

  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  trackVisitor(@Body() body: TrackVisitorsDto) {
    return this.visitorService.trackVisitor(body);
  }

  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  visitorAnalytics(@Query() query: VisitorAnalyticsDto) {
    return this.visitorService.visitorAnalytics(query);
  }

  @Post('message')
  @HttpCode(HttpStatus.NO_CONTENT)
  visitorMessages(@Body() body: VisitorMessagesDto) {
    return this.visitorService.visitorMessages(body);
  }

  @Post('email')
  @HttpCode(HttpStatus.NO_CONTENT)
  visitorEmails(@Body() body: VisitorEmailsDto) {
    return this.visitorService.visitorEmails(body);
  }
}