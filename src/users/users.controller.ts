import { MeResult } from './users.interface';
import { UsersService } from './users.service';
import { UserAnalyticsDto } from './users.dto';
import type { AuthenticatedRequest } from '../auth/auth.interface';
import { Controller, Get, HttpCode, HttpStatus, Query, Req } from '@nestjs/common';

@Controller('users')
export class UsersController {

  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: AuthenticatedRequest): Promise<MeResult> {
    return this.usersService.getMe(req);
  }

  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  userAnalytics(@Query() query: UserAnalyticsDto) {
    return this.usersService.userAnalytics(query);
  }
}