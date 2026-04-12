import type { Request } from 'express';
import * as speakeasy from 'speakeasy';
import { hash, compare } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';
import { SignupDto } from './dto/signup.dto';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'src/logger/logger.service';
import { RedisService } from 'src/database/redis/redis.service';
import { Injectable, UnauthorizedException, BadRequestException, HttpException } from '@nestjs/common';

@Injectable()
export class AuthService {

  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly loggerService: Logger,
    private readonly redisService: RedisService
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      }
    });
  }

  // Controller functions

//   async isEmailAvailable(query: IsEmailAvailableDto): Promise<{ available: boolean }> {
//     try {
//       const { email } = query;
//       this.loggerService.log('isEmailAvailable {controller}');
//       await new Promise(resolve => setTimeout(resolve, 2000));
//       const result = await this.usersService.checkEmailAvailability(email);
//       if (true)
//         return { available: false };
//       return { available: true };
//     } catch(error) {
//       this.loggerService.error(error.message, error.status ?? 500);
//       throw new HttpException(error.message, error.status ?? 500);
//     }
//   }

  signup(body: SignupDto, req: Request): {
    fullName: string;
    email: string;
    password: string;
    gender: string;
    birthday: string;
    ip: string;
  } {
    const ip = this.clientIp(req);
    return {
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      gender: body.gender,
      birthday: body.birthday,
      ip,
    };
  }

  private clientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    let raw: string;
    if (typeof forwarded === 'string') {
      raw = forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded)) {
      raw = forwarded[0]?.trim() ?? '';
    } else {
      raw = req.ip ?? req.socket.remoteAddress ?? '';
    }
    return this.normalizeClientIp(raw);
  }

  /** ::1 is IPv6 loopback (same as 127.0.0.1); prefer dotted IPv4 for readability. */
  private normalizeClientIp(ip: string): string {
    if (ip === '::1') {
      return '127.0.0.1';
    }
    if (ip.startsWith('::ffff:')) {
      return ip.slice(7);
    }
    return ip;
  }

//   async signupVerifyOtp(body: SignupVerifyOtpDto): Promise<{ accessToken: string; info: Object; }> {
//     try {
//       const { email, otp } = body;
//       this.loggerService.log('signupVerifyOtp {controller}');
//       const userInstance = await this.redisService.get(`user:${email}`);
//       await this.verifyOtp(userInstance.secret, otp);
//       userInstance.password = await this.hashPassword(userInstance.password);
//       const newUser = await this.usersService.createUser(userInstance);
//       const privateKey = this.configService.get<string>('JWT_PRIVATE_KEY');
//       const accessToken = this.generateAccessToken(newUser, privateKey);
//       userInstance.deeds = [];
//       return { accessToken, info: userInstance };
//     } catch (error) {
//       this.loggerService.error(error.message, error.status ?? 500);
//       throw new HttpException(error.message, error.status ?? 500);
//     }
//   }

//   async login(body: LoginDto): Promise<{ accessToken: string; two_fa: boolean; info: Object; }> {
//     try{
//       const { email, password } = body;
//       this.loggerService.log('login {controller}');
//       const userInstance = await this.usersService.getUser(email);
//       await this.comparePasswords(password, userInstance.password);
//       const privateKey = this.configService.get<string>('JWT_PRIVATE_KEY');
//       const accessToken = this.generateAccessToken(userInstance, privateKey);
//       return { accessToken, two_fa: userInstance.two_fa, info: !userInstance.two_fa ? await this.usersService.getUserInfo(userInstance.email) : null };
//     } catch(error) {
//       this.loggerService.error(error.message, error.status ?? 500);
//       throw new HttpException(error.message, error.status ?? 500);
//     }
//   }

//   async verifyPassword(request: AuthenticatedRequest, body: VerifyPasswordDto): Promise<void> {
//     try {
//       const { password } = body;
//       const { email } = request.user;
//       this.loggerService.log('verifyPassword {controller}');
//       const userPassword: string = await this.usersService.getPasswordByEmail(email);
//       await this.comparePasswords(password, userPassword);
//     } catch(error) {
//       this.loggerService.error(error.message, error.status ?? 500);
//       throw new HttpException(error.message, error.status ?? 500);
//     }
//   }

//   async resetPassword(body: ResetPasswordDto): Promise<void> {
//     try {
//       const { password, email } = body;
//       this.loggerService.log('resetPassword {controller}');
//       const hashedPassword = await this.hashPassword(password);
//       await this.usersService.updatePassword(email, hashedPassword);
//     } catch(error) {
//       this.loggerService.error(error.message, error.status ?? 500);
//       throw new HttpException(error.message, error.status ?? 500);    
//     }
//   }

//   async toggle2fa(request: AuthenticatedRequest, body: Toggle2FaDto): Promise<void> {
//     try {
//       const { email, two_fa } = request.user;
//       const { toggle } = body;
//       this.loggerService.log('toggle2fa {controller}');
//       if (toggle !== two_fa) 
//         await this.usersService.update2fa(email, toggle);
//     } catch(error) {
//       this.loggerService.error(error.message, error.status ?? 500);
//       throw new HttpException(error.message, error.status ?? 500);    
//     }
//   }

//   async sendOtp(body: sendOtpDto): Promise<void> {
//     try {
//       const { email } = body;
//       this.loggerService.log('sendOtp {controller}');
//       const userInstance = await this.usersService.getUserSecret(email);
//       const otp = this.generateOtpBySecret(userInstance.secret);
//       await this.redisService.set(`secret:${email}`, userInstance.secret);
//       await this.sendEmail(email, 'OTP Code for Kitab', userInstance.name, otp);
//     } catch(error) {
//       this.loggerService.error(error.message, error.status ?? 500);
//       throw new HttpException(error.message, error.status ?? 500);
//     }
//   }

  // Helper functions

  async sendEmail(to: string, subject: string, name: string, otp: string): Promise<void> {
    this.loggerService.log('sendEmail {helper}');
    const html: string = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #7d7dfa; text-align: center;">Your One-Time Password</h2>
        <p>Dear ${name},</p>
        <p>We received a request to secure your account with a One-Time Password (OTP). Please use the code below to complete your action:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #7d7dfa; background-color: #f9f9f9; padding: 10px 20px; border: 1px solid #ddd; border-radius: 4px;">${otp}</span>
        </div>
        <p><strong>Note:</strong> This OTP is valid for <strong>1 minute</strong>. For your security, please do not share this code with anyone.</p>
        <p>If you did not request this OTP, please contact our support team immediately.</p>
        <p>Best regards,</p>
        <p><strong>${this.configService.get<string>('EMAIL_NAME')}</strong></p>
      </div>
    `;
    const mailOptions = {
      from: `"${this.configService.get<string>('EMAIL_NAME')}" <${this.configService.get<string>('EMAIL_USER')}>`,
      to,
      subject,
      html
    };
    await this.transporter.sendMail(mailOptions);
  }

  generateOtp(): [string, string] {
    this.loggerService.log('generateOtp {helper}');
    let secret = speakeasy.generateSecret({ length: 20 }).base32;
    let otp = speakeasy.totp({
      secret,
      encoding: 'base32',
      digits: 4,
      step: 60,
      window: 1
    });
    return [otp, secret];
  }

  generateOtpBySecret(secret: string): string {
    this.loggerService.log('generateOtp {helper}');
    let otp = speakeasy.totp({
      secret: secret,
      encoding: 'base32',
      digits: 4,
      step: 60,
      window: 1
    });
    return otp;
  }

  async verifyOtp(secret: string, otp: string): Promise<void> {
    this.loggerService.log('verifyOtp {helper}');
    const isOtpValid = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: otp,
      digits: 4,
      step: 60,
      window: 1
    });
    if ( !isOtpValid ) {
      throw new BadRequestException('Invalid OTP');
    }
  }

  async hashPassword(password: string): Promise<string> {
    this.loggerService.log('hashPassword {helper}');
    const saltRounds = 14;
    return hash(password, saltRounds);
  }

  generateAccessToken(newUser: { id: number; name: string; email: string }, privateKey: string): string {
    return this.jwtService.sign(
      { id: newUser.id, name: newUser.name, email: newUser.email },
      { privateKey, algorithm: 'RS256' }
    );
  }

  async comparePasswords(plainPassword: string, hashedPassword: string): Promise<void> {
    this.loggerService.log('comparePasswords {helper}');
    const comparePasswords = await compare(plainPassword, hashedPassword);
    if (!comparePasswords) {
      throw new UnauthorizedException('Invalid email or credentials');
    }
  }
}