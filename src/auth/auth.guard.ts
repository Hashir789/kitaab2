import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { AuthenticatedRequest, JwtAuthUser } from './auth.interface';
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {

  private readonly excludedUrls: string[] = [
    '/auth/me',
    '/auth/login',
    '/auth/signup',
    '/auth/refresh',
    '/health-check',
    '/visitors/track',
    '/visitors/email',
    '/auth/otp-verify',
    '/visitors/message',
    '/auth/resend-link',
    '/auth/email-verify',
    '/auth/reset-password',
    '/auth/forgot-password',
    '/database/connection-check'
  ];
  
  constructor(
    private readonly loggerService: Logger,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.loggerService.log('canActivate {guard}');
    const request: AuthenticatedRequest = context.switchToHttp().getRequest();
    const baseUrl =
      typeof request.path === 'string' && request.path.length > 0
        ? request.path
        : String(request.url ?? '').split('?')[0];
    if (this.excludedUrls.includes(baseUrl)) {
      return true;
    }
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      this.loggerService.error('Authorization header not found or malformed', HttpStatus.UNAUTHORIZED);
      throw new HttpException('Authorization header not found or malformed', HttpStatus.UNAUTHORIZED);
    }
    const token: string = authHeader.split(' ')[1];
    const publicKey: string = this.configService.get<string>('JWT_PUBLIC_KEY') ?? '';
    let payload: JwtAuthUser;
    try {
      payload = (await this.jwtService.verifyAsync(token, {
        publicKey,
        algorithms: ['RS256'],
      })) as JwtAuthUser;
    } catch {
      this.loggerService.error('Invalid or expired token', HttpStatus.UNAUTHORIZED);
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }

    if (payload?.type !== 'access') {
      this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
      throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
    }
    if (!payload.email_verified) {
      this.loggerService.error('Email not verified', HttpStatus.FORBIDDEN);
      throw new HttpException('Email not verified', HttpStatus.FORBIDDEN);
    }

    request.user = payload;
    return true;
  }
}