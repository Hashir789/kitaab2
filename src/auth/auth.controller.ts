import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { OtpVerifyDto } from './dto/otpVerify.dto';
import { signupResult } from './interface/signup.interface';
import { EmailVerifyQueryDto } from './dto/emailVerify.dto';
import { otpVerifyResult } from './interface/otpVerify.interface'; 
import { EmailVerifyResult } from './interface/emailVerify.interface';
import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus }  from '@nestjs/common';

@Controller('auth')
export class AuthController {
  
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() body: SignupDto): Promise<signupResult> {
    return this.authService.signup(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto): Promise<signupResult> {
    return this.authService.login(body);
  }

  @Get('email-verify')
  async emailVerify(@Query() query: EmailVerifyQueryDto): Promise<EmailVerifyResult> {
    return this.authService.emailVerify(query.email);
  }

  @Post('otp-verify')
  @HttpCode(HttpStatus.OK)
  async otpVerify(@Body() body: OtpVerifyDto): Promise<otpVerifyResult> {
    return this.authService.otpVerify(body);
  }
}