import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { OtpVerifyDto } from './dto/otpVerify.dto';
import { update2faDto } from './dto/update2fa.dto';
import { signupResult } from './interface/signup.interface';
import { EmailVerifyQueryDto } from './dto/emailVerify.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { AuthenticatedRequest } from './auth.interface';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { otpVerifyResult } from './interface/otpVerify.interface'; 
import { EmailVerifyResult } from './interface/emailVerify.interface';
import { Controller, Post, Get, Patch, Body, Query, Req, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';

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

  @Patch('2fa')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update2fa(@Body() body: update2faDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.authService.update2fa(body, req);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(body);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Body() body: ChangePasswordDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.authService.changePassword(body, req);
  }
}