import { UsersService } from './users.service';
import { UserAnalyticsDto } from './users.dto';
import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';

@Controller('users')
export class UsersController {

  constructor(private readonly usersService: UsersService) {}

  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  userAnalytics(@Query() query: UserAnalyticsDto) {
    return this.usersService.userAnalytics(query);
  }
}