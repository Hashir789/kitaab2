import { AppService } from './app.service';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

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
}