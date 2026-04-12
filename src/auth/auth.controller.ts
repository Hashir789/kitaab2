import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { Controller, Post, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.OK)
  signup(@Body() body: SignupDto, @Req() req: Request) {
    return this.authService.signup(body, req);
  }
}
