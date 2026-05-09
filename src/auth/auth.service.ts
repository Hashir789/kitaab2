import { StringValue } from 'ms';
import { randomBytes } from 'crypto';
import { hash, compare } from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { OtpVerifyDto } from './dto/otpVerify.dto';
import { update2faDto } from './dto/update2fa.dto';
import { EmailService } from '../email/email.service';
import { AuthenticatedRequest } from './auth.interface';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RedisService } from '../database/redis/redis.service';
import { verifyOtpResult } from './interface/verifyOtp.interface';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { loginQueryInterface, loginResult } from './interface/login.interface';
import { signupQueryInterface, signupResult } from './interface/signup.interface';
import { ResetPasswordQueryInterface } from './interface/resetPassword.interface';
import { ForgotPasswordQueryInterface } from './interface/forgotPassword.interface';
import { ChangePasswordQueryInterface } from './interface/changePassword.interface';
import { otpVerifyQueryInterface, otpVerifyResult } from './interface/otpVerify.interface';
import { EmailVerifyQueryInterface, EmailVerifyResult } from './interface/emailVerify.interface';
import { Update2FaGetQueryInterface, Update2FaPatchQueryInterface } from './interface/update2fa.interface';

@Injectable()
export class AuthService {

  constructor(
    private readonly loggerService: Logger,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
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
        this.loggerService.error('Visitor not found', HttpStatus.NOT_FOUND);
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }

      const { id, full_name, email, gender, dob, two_factor_enabled, created_at, email_verified } = rows[0];
      const accessToken = await this.jwtService.signAsync({ sub: id, email, type: 'access', email_verified });
      const refreshExpiresIn = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const refreshToken = await this.jwtService.signAsync(
        { sub: id, email, type: 'refresh' },
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
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async login(payload: LoginDto): Promise<loginResult> {
    try {
      this.loggerService.log('login {controller}');
      const { email: mail, password, anonymous_id } = payload;
      const pepper = this.configService.get<string>('PASSWORD_PEPPER');
      const rows = await this.postgresService.query<loginQueryInterface>(`
        SELECT id, password_hash, full_name, email, gender, dob, created_at, two_factor_enabled, email_verified
        FROM users WHERE email = $1
      `, [mail]);
      if (!rows?.length) {
        this.loggerService.error('Invalid email or password', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
      }
      const { id, email: userEmail, password_hash, dob, email, gender, full_name, created_at, two_factor_enabled, email_verified } = rows[0];
      const hashPassword = await compare(password + pepper, password_hash);
      if (!hashPassword) {
        this.loggerService.error('Invalid email or password', HttpStatus.UNAUTHORIZED);
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
      const accessToken = await this.jwtService.signAsync({ sub: id, email: userEmail, type: 'access', email_verified });
      const refreshExpiresIn = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const refreshToken = await this.jwtService.signAsync(
        { sub: id, email: userEmail, type: 'refresh' },
        { expiresIn: refreshExpiresIn }
      );
      return { dob, email, gender, full_name, created_at, two_factor_enabled, access_token: accessToken, refresh_token: refreshToken };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async otpVerify(payload: OtpVerifyDto): Promise<otpVerifyResult> {
    try {
      this.loggerService.log('otpVerify {controller}');
      const { email: mail, otp } = payload;
      const rows = await this.postgresService.query<otpVerifyQueryInterface>(`
        SELECT secret, email_verified FROM users WHERE email = $1
      `, [mail]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { secret, email_verified } = rows[0];
      if (!this.verifyOtp({ secret, otp })) {
        this.loggerService.error('Invalid or expired code', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired code', HttpStatus.BAD_REQUEST);
      }
      if (!email_verified) {
        await this.postgresService.query(`
          UPDATE users SET email_verified = TRUE WHERE email = $1
        `, [mail]);
      }
      return { verified: true };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async forgotPassword(payload: ForgotPasswordDto): Promise<void> {
    try {
      this.loggerService.log('forgotPassword {controller}');
      const { email: mail } = payload;
      const rows = await this.postgresService.query<ForgotPasswordQueryInterface>(
        `SELECT id, full_name FROM users WHERE email = $1`,
        [mail],
      );
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { id, full_name } = rows[0];
      const token = randomBytes(32).toString('hex');
      const ttlSeconds =
        Number(this.configService.get<string>('PASSWORD_RESET_EXPIRES_IN_SECONDS')) || 3600;
      await this.redisService.set(`password-reset:${token}`, String(id), ttlSeconds);
      const baseUrl = this.configService.get<string>('PASSWORD_RESET_URL_BASE')?.replace(/\/$/, '');
      const resetLink = baseUrl ? `${baseUrl}?token=${encodeURIComponent(token)}` : null;
      const expiresInMinutes = Math.max(1, Math.ceil(ttlSeconds / 60));
      await this.emailService.sendPasswordResetEmail({
        email: mail,
        name: full_name,
        resetLink,
        plainToken: resetLink ? undefined : token,
        expiresInMinutes
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async resetPassword(payload: ResetPasswordDto): Promise<void> {
    try {
      this.loggerService.log('resetPassword {controller}');
      const { token, new_password } = payload;
      const key = `password-reset:${token}`;
      const userId = await this.redisService.get(key);
      if (!userId) {
        this.loggerService.error('Invalid or expired token', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST);
      }

      const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
      const passwordHash = await hash(new_password + pepper, 12);
      const updated = await this.postgresService.query<ResetPasswordQueryInterface>(`
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
        RETURNING id
      `, [passwordHash, userId]);
      if (!updated?.length) {
        this.loggerService.error('Invalid or expired token', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST);
      }

      await this.redisService.del(key);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async changePassword(payload: ChangePasswordDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('changePassword {controller}');
      const { sub: user_id, email, type: token_type } = req.user;
      const { current_password, new_password } = payload;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (current_password === new_password) {
        this.loggerService.error('New password must be different from current password', HttpStatus.BAD_REQUEST);
        throw new HttpException('New password must be different from current password', HttpStatus.BAD_REQUEST);
      }
      const rows = await this.postgresService.query<ChangePasswordQueryInterface>(`
        SELECT id, password_hash FROM users WHERE id = $1 AND email = $2
      `, [user_id, email]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      const { password_hash } = rows[0];
      const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
      const matches = await compare(current_password + pepper, password_hash);
      if (!matches) {
        this.loggerService.error('Invalid current password', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid current password', HttpStatus.UNAUTHORIZED);
      }
      const newPasswordHash = await hash(new_password + pepper, 12);
      const updated = await this.postgresService.query<ChangePasswordQueryInterface>(`
        UPDATE users
        SET password_hash = $1
        WHERE id = $2 AND email = $3
        RETURNING id
      `, [newPasswordHash, user_id, email]);
      if (!updated?.length) {
        this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
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
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async update2fa(body: update2faDto, req: AuthenticatedRequest): Promise<void> {
    try {
      this.loggerService.log('update2fa {controller}');
      const { sub: user_id, email, type: token_type } = req.user;
      const { two_factor_enabled } = body;
      if (token_type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      const rows = await this.postgresService.query<Update2FaGetQueryInterface>(`
        SELECT email_verified FROM users WHERE id = $1 AND email = $2
      `, [user_id, email]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      const { email_verified } = rows[0];
      if (email_verified) {
        const updated = await this.postgresService.query<Update2FaPatchQueryInterface>(`
          UPDATE users SET two_factor_enabled = $1 WHERE id = $2 AND email = $3
          RETURNING two_factor_enabled
        `, [two_factor_enabled, user_id, email]);
        if (!updated?.length) {
          this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
          throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
        }
      } else {
        this.loggerService.error('Email not verified', HttpStatus.FORBIDDEN);
        throw new HttpException('Email not verified', HttpStatus.FORBIDDEN);
      }
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
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