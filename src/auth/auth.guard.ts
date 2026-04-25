import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { AuthenticatedRequest } from './auth.interface';
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, HttpException } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {

  private readonly excludedUrls: string[] = [
    '/auth/signup',
    '/health-check',
    '/visitors/track',
    '/visitors/email',
    '/visitors/message',
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
    const baseUrl = request.url.split('?')[0];
    if (this.excludedUrls.includes(baseUrl)) {
      return true;
    }
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header not found or malformed');
    }
    const token: string = authHeader.split(' ')[1];
    try {
      const publicKey: string = this.configService.get<string>('JWT_PUBLIC_KEY') ?? '';
      const payload: { id: number, name: string, email: string, two_fa: boolean, join_date: Date } = await this.jwtService.verifyAsync(token, {
        publicKey,
        algorithms: ['RS256'],
      });
      request.user = payload;
      return true;
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }  
}