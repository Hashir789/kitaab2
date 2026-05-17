import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.interface';
import { Controller, Post, Get, Patch, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { loginResult, EmailVerifyResult, refreshTokenResultInterface, MeResult } from './auth.interface';
import { ChangePasswordDto, EmailVerifyQueryDto, ForgotPasswordDto, LoginDto, MeQueryDto, OtpVerifyDto, RefreshDto, ResendLinkDto, ResetPasswordDto, SignupDto, update2faDto } from './auth.dto';

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
  async otpVerify(@Body() body: OtpVerifyDto): Promise<void> {
    await this.authService.otpVerify(body);
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