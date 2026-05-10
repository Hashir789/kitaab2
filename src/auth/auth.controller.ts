import { MeQueryDto } from './dto/me.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { RefreshDto } from './dto/refresh.dto';
import { OtpVerifyDto } from './dto/otpVerify.dto';
import { update2faDto } from './dto/update2fa.dto';
import { MeResult } from './interface/me.interface';
import { ResendLinkDto } from './dto/resendLink.dto';
import { loginResult } from './interface/login.interface';
import { EmailVerifyQueryDto } from './dto/emailVerify.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { AuthenticatedRequest } from './auth.interface';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { ChangePasswordDto } from './dto/changePassword.dto';
import { otpVerifyResult } from './interface/otpVerify.interface'; 
import { EmailVerifyResult } from './interface/emailVerify.interface';
import { refreshTokenResultInterface } from './interface/refresh.interface';
import { Controller, Post, Get, Patch, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signup(@Body() body: SignupDto): Promise<void> {
    await this.authService.signup(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto): Promise<loginResult> {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshDto): Promise<refreshTokenResultInterface> {
    return this.authService.refresh(body);
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

  @Post('resend-link')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendLink(@Body() body: ResendLinkDto): Promise<void> {
    await this.authService.resendLink(body);
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

  @Get('me')
  async me(@Query() query: MeQueryDto): Promise<MeResult> {
    return this.authService.me(query);
  }
}