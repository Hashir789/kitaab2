import { AppService } from './app.service';
import { TrackVisitorsPayloadDto } from './dto/TrackVisitors.dto';
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
  trackVisitor(@Body() body: TrackVisitorsPayloadDto, @Ip() ip: string) {
    return this.appService.trackVisitor(body, ip);
  }
}