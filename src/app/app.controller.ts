import { AppService } from './app.service';
import { TrackVisitorsDto } from './dto/TrackVisitors.dto';
import { VisitorEmailsDto } from './dto/VisitorEmails.dto';
import { VisitorMessagesDto } from './dto/VisitorMessages.dto';
import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';

@Controller()
export class AppController {
  
  constructor(private readonly appService: AppService) {}

  @Get('/health-check')
  @HttpCode(HttpStatus.NO_CONTENT)
  healthCheck() {
    this.appService.healthCheck();
  }
  
  @Get('/database/connection-check')
  @HttpCode(HttpStatus.OK)
  databaseConnectionCheck() {
    return this.appService.checkDatabaseConnections();
  }

  @Post('/visitors/track')
  @HttpCode(HttpStatus.NO_CONTENT)
  trackVisitor(@Body() body: TrackVisitorsDto, @Ip() ip: string) {
    return this.appService.trackVisitor(body, ip);
  }

  @Post('/visitors/message')
  @HttpCode(HttpStatus.NO_CONTENT)
  visitorMessages(@Body() body: VisitorMessagesDto) {
    return this.appService.visitorMessages(body);
  }

  @Post('/visitors/email')
  @HttpCode(HttpStatus.NO_CONTENT)
  visitorEmails(@Body() body: VisitorEmailsDto) {
    return this.appService.visitorEmails(body);
  }
}