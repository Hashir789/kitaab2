import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { signupResult } from './interface/signup.interface';
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() body: SignupDto): Promise<signupResult> {
    return this.authService.signup(body);
  }
}