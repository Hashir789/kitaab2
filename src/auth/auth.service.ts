import { StringValue } from 'ms';
import { hash, compare } from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { OtpVerifyDto } from './dto/otpVerify.dto';
import { EmailService } from '../email/email.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { loginQueryInterface, loginResult } from './interface/login.interface';
import { signupQueryInterface, signupResult } from './interface/signup.interface';
import { otpVerifyQueryInterface, otpVerifyResult } from './interface/otpVerify.interface';
import { EmailVerifyQueryInterface, EmailVerifyResult } from './interface/emailVerify.interface';
import { verifyOtpResult } from './interface/verifyOtp.interface';

@Injectable()
export class AuthService {

  constructor(
    private readonly loggerService: Logger,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly postgresService: PostgresService
  ) {}

  // Controller functions

  async signup(payload: SignupDto): Promise<signupResult> {
    try {
      this.loggerService.log('signup {controller}');
      const { anonymous_id, full_name: fullName, email: mail, password, gender: sex, dob: dateOfBirth } = payload;
      const pepper = this.configService.get<string>('PASSWORD_PEPPER');
      const passwordHash = await hash(password + pepper, 12);
      const [otp, secret] = this.generateOtp();
      const rows = await this.postgresService.query<signupQueryInterface>(`
        INSERT INTO users (visitor_id, email, password_hash, full_name, gender, dob, secret, email_verified, two_factor_enabled, last_login_at)
        SELECT v.id, $1, $2, $3, $4, $5::date, $6, FALSE, FALSE, NOW()
        FROM visitors v
        WHERE v.anonymous_id = $7
        ON CONFLICT (email)
        DO NOTHING
        RETURNING *;
      `, [mail, passwordHash, fullName, sex, dateOfBirth, secret, anonymous_id]);

      if (!rows?.length) {
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }

      const { id, full_name, email, gender, dob, two_factor_enabled, created_at } = rows[0];
      const accessToken = await this.jwtService.signAsync({ sub: id, email: email, type: 'access' });
      const refreshExpiresIn = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const refreshToken = await this.jwtService.signAsync(
        { sub: id, email: email, type: 'refresh' },
        { expiresIn: refreshExpiresIn }
      );
      const expiresInMinutes =
        Number(this.configService.get<string>('OTP_EXPIRES_IN_MINUTES')) || 15;
      await this.emailService.sendOtpVerificationEmail({
        email,
        name: full_name,
        otp,
        expiresInMinutes,
      });
      return { dob, email, gender, full_name, created_at, two_factor_enabled, access_token: accessToken, refresh_token: refreshToken };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  async login(payload: LoginDto): Promise<loginResult> {
    try {
      this.loggerService.log('login {controller}');
      const { email: mail, password, anonymous_id } = payload;
      const pepper = this.configService.get<string>('PASSWORD_PEPPER');
      const rows = await this.postgresService.query<loginQueryInterface>(`
        SELECT id, password_hash, full_name, email, gender, dob, created_at, two_factor_enabled
        FROM users WHERE email = $1
      `, [mail]);
      const { id, email: userEmail, password_hash, dob, email, gender, full_name, created_at, two_factor_enabled } = rows[0];
      const hashPassword = await compare(password + pepper, password_hash)
      if (!rows.length || !hashPassword) {
        throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
      }
      await this.postgresService.query(`
        UPDATE users u
        SET 
          visitor_id = v.id,
          last_login_at = NOW()
        FROM visitors v
        WHERE 
          u.id = $1
          AND v.anonymous_id = $2
      `, [id, anonymous_id]);
      const accessToken = await this.jwtService.signAsync({ sub: id, email: userEmail, type: 'access' });
      const refreshExpiresIn = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const refreshToken = await this.jwtService.signAsync(
        { sub: id, email: userEmail, type: 'refresh' },
        { expiresIn: refreshExpiresIn }
      );
      return { dob, email, gender, full_name, created_at, two_factor_enabled, access_token: accessToken, refresh_token: refreshToken };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  async otpVerify(payload: OtpVerifyDto): Promise<otpVerifyResult> {
    try {
      this.loggerService.log('verifyOtp {controller}');
      const { email: mail, otp } = payload;
      const rows = await this.postgresService.query<otpVerifyQueryInterface>(`
        SELECT secret, email_verified FROM users WHERE email = $1
      `, [mail]);
      if (!rows?.length) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { secret, email_verified } = rows[0];
      if (email_verified) {
        return { verified: true };
      }
      if (!this.verifyOtp({ secret, otp })) {
        throw new HttpException('Invalid or expired code', HttpStatus.BAD_REQUEST);
      }
      await this.postgresService.query(`
        UPDATE users SET email_verified = TRUE WHERE email = $1
      `, [mail]);
      return { verified: true };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  async emailVerify(email: string): Promise<EmailVerifyResult> {
    try {
      this.loggerService.log('emailVerify {controller}');
      const rows = await this.postgresService.query<EmailVerifyQueryInterface>(`
        SELECT email_verified FROM users WHERE email = $1
      `, [email]);
      if (!rows?.length) {
        return { verified: null };
      }
      return { verified: rows[0].email_verified };  
    } catch(error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }

  // Helper functions

  generateOtp(): [string, string] {
    this.loggerService.log('generateOtp {helper}');
    let secret = speakeasy.generateSecret({ length: 20 }).base32;
    let otp = speakeasy.totp({
      secret: secret,
      encoding: 'base32',
      digits: 4,
      step: 60,
      window: 1
    });
    return [otp, secret];
  }

  verifyOtp(body: verifyOtpResult): boolean {
    this.loggerService.log('verifyOtp {helper}');
    return Boolean(
      speakeasy.totp.verify({
        secret: body.secret,
        encoding: 'base32',
        token: body.otp,
        digits: 4,
        step: 60,
        window: 1,
      }),
    );
  }
}