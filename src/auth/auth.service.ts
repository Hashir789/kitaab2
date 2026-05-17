import { StringValue } from 'ms';
import { hash, compare } from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Logger } from '../logger/logger.service';
import { EmailService } from '../email/email.service';
import { CryptoService } from '../crypto/crypto.service';
import type { AuthenticatedRequest } from './auth.interface';
import { RedisService } from '../database/redis/redis.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, MeQueryDto, OtpVerifyDto, RefreshDto, ResendLinkDto, ResetPasswordDto, SignupDto, update2faDto } from './auth.dto';
import { verifyOtpResult, loginQueryInterface, loginResult, ResetPasswordQueryInterface, ForgotPasswordQueryInterface, ChangePasswordQueryInterface, otpVerifyQueryInterface, EmailVerifyQueryInterface, EmailVerifyResult, signupInsertQueryInterface, signupUpdateQueryInterface, refreshTokenQueryInterface, refreshTokenResultInterface, Update2FaGetQueryInterface, Update2FaPatchQueryInterface, resendLinkGetQueryInterface, resendLinkUpdateQueryInterface, MeResult } from './auth.interface';

@Injectable()
export class AuthService {

  constructor(
    private readonly loggerService: Logger,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly CryptoService: CryptoService,
    private readonly postgresService: PostgresService
  ) {}

  // Controller functions

  async signup(payload: SignupDto): Promise<void> {
    try {
      this.loggerService.log('signup {controller}');
      const { anonymous_id, full_name, email, password, gender, dob, recovery_key } = payload;
      const pepper = this.configService.get<string>('PASSWORD_PEPPER');
      const passwordHash = await hash(password + pepper, 12);
      const [otp, secret] = this.generateOtp();
      const encrypted = await this.CryptoService.prepareSignupStorage({ password, fields: { full_name, email, secret }, recovery_key });
      const { email: email_encrypted, full_name: full_name_encrypted, secret: secret_encrypted, key_salt, key_iv, encrypted_master_key, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key } = encrypted;
      const rows = await this.postgresService.query<signupInsertQueryInterface>(`
        INSERT INTO users (visitor_id, email, password_hash, full_name, gender, dob, secret, key_salt, key_iv, encrypted_master_key, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key, email_verified, two_factor_enabled, last_login_at)
        SELECT v.id, $1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, FALSE, FALSE, NOW()
        FROM visitors v
        WHERE v.anonymous_id = $13
        ON CONFLICT (email)
        DO NOTHING
        RETURNING id, email_verified, two_factor_enabled, created_at;
      `, [ email_encrypted, passwordHash, full_name_encrypted, gender, dob, secret_encrypted, key_salt, key_iv, encrypted_master_key, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key, anonymous_id ]);
      if (!rows?.length) {
        this.loggerService.error('User already exists', HttpStatus.NOT_FOUND);
        throw new HttpException('User already exists', HttpStatus.NOT_FOUND);
      }
      const { id, email_verified, two_factor_enabled, created_at  } = rows[0];
      const access_token = await this.jwtService.signAsync({ sub: id, email, type: 'access', email_verified });
      const refresh_expires_in = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const refresh_token = await this.jwtService.signAsync(
        { sub: id, email, type: 'refresh' },
        { expiresIn: refresh_expires_in }
      );
      const refresh_token_hash = createHash('sha256').update(refresh_token).digest('hex');
      const updated = await this.postgresService.query<signupUpdateQueryInterface>(`
        UPDATE users SET refresh_token_hash = $1 WHERE id = $2 RETURNING id
      `, [refresh_token_hash, id]);
      if (!updated?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const session_payload = { dob, email, gender, full_name, created_at, two_factor_enabled, access_token: access_token };
      await this.redisService.set(`user:${email_encrypted}`, JSON.stringify(session_payload));
      const expires_in_minutes = Number(this.configService.get<string>('OTP_EXPIRES_IN_MINUTES'));
      await this.emailService.sendOtpVerificationEmail({ email, full_name, otp, expires_in_minutes });
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
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(mail);
      const rows = await this.postgresService.query<loginQueryInterface>(`
        SELECT id, password_hash, full_name, email, gender, dob, created_at, two_factor_enabled, email_verified, key_salt, key_iv, encrypted_master_key
        FROM users WHERE email = $1
      `, [encrypted_email]);
      if (!rows?.length) {
        this.loggerService.error('Invalid email or password', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
      }
      const { id, email, password_hash, dob, gender, full_name, created_at, two_factor_enabled, email_verified, key_salt, key_iv, encrypted_master_key } = rows[0];
      const hash_password = await compare(password + pepper, password_hash);
      if (!hash_password) {
        this.loggerService.error('Invalid email or password', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
      }
      await this.postgresService.query<void>(`
        UPDATE users u
        SET 
          visitor_id = v.id,
          last_login_at = NOW()
        FROM visitors v
        WHERE 
          u.id = $1
          AND v.anonymous_id = $2
      `, [id, anonymous_id]);
      const access_token = await this.jwtService.signAsync({ sub: id, email: mail, type: 'access', email_verified });
      const refresh_expires_in = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const refresh_token = await this.jwtService.signAsync(
        { sub: id, email: mail, type: 'refresh' },
        { expiresIn: refresh_expires_in }
      );
      const refresh_token_hash = createHash('sha256').update(refresh_token).digest('hex');
      await this.postgresService.query<void>(`
        UPDATE users SET refresh_token_hash = $1 WHERE id = $2
      `, [refresh_token_hash, id]);
      return { dob, email, gender, full_name, key_salt, key_iv, encrypted_master_key, created_at, two_factor_enabled, access_token, refresh_token };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async refresh(payload: RefreshDto): Promise<refreshTokenResultInterface> {
    try {
      this.loggerService.log('refresh {controller}');
      const { refresh_token } = payload;
      const public_key: string = this.configService.get<string>('JWT_PUBLIC_KEY') ?? '';
      const decoded = (await this.jwtService
        .verifyAsync(refresh_token, {
          publicKey: public_key,
          algorithms: ['RS256'],
        })
        .catch(() => {
          this.loggerService.error('Invalid or expired token', HttpStatus.UNAUTHORIZED);
          throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
        })) as { sub?: number; email?: string; type?: string };
      const { sub, email, type } = decoded;
      if (type !== 'refresh' || !sub || !email) {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(email);
      const rows = await this.postgresService.query<refreshTokenQueryInterface>(`
        SELECT id, email_verified, refresh_token_hash FROM users WHERE id = $1 AND email = $2 LIMIT 1
      `, [sub, encrypted_email]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      const { id, email_verified, refresh_token_hash } = rows[0];
      const incoming_hash = createHash('sha256').update(refresh_token).digest('hex');
      if (!refresh_token_hash || refresh_token_hash !== incoming_hash) {
        this.loggerService.error('Invalid or expired token', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
      }
      const access_token = await this.jwtService.signAsync({
        email,
        sub: id,
        type: 'access',
        email_verified
      });
      const refresh_expires_in = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const new_refresh_token = await this.jwtService.signAsync(
        { sub: id, email, type: 'refresh' },
        { expiresIn: refresh_expires_in },
      );
      const new_refresh_hash = createHash('sha256').update(new_refresh_token).digest('hex');
      await this.postgresService.query<void>(`
        UPDATE users SET refresh_token_hash = $1 WHERE id = $2 AND email = $3
      `, [new_refresh_hash, id, encrypted_email]);
      return { access_token };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async otpVerify(payload: OtpVerifyDto): Promise<void> {
    try {
      this.loggerService.log('otpVerify {controller}');
      const { email, otp } = payload;
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(email);
      const rows = await this.postgresService.query<otpVerifyQueryInterface>(`
        SELECT secret, email_verified FROM users WHERE email = $1
      `, [encrypted_email]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { secret: encrypted_secret, email_verified } = rows[0];
      const secret = await this.CryptoService.decryptSecret(encrypted_secret);
      if (!this.verifyOtp({ secret, otp })) {
        this.loggerService.error('Invalid or expired code', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired code', HttpStatus.BAD_REQUEST);
      }
      if (!email_verified) {
        await this.postgresService.query<void>(`
          UPDATE users SET email_verified = TRUE WHERE email = $1
        `, [encrypted_email]);
      }
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async resendLink(payload: ResendLinkDto): Promise<void> {
    try {
      this.loggerService.log('resendLink {controller}');
      const { email, full_name } = payload;
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(email);
      const rows = await this.postgresService.query<resendLinkGetQueryInterface>(`
        SELECT email_verified FROM users WHERE email = $1
      `, [encrypted_email]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { email_verified } = rows[0];
      if (email_verified) {
        this.loggerService.error('Email already verified', HttpStatus.BAD_REQUEST);
        throw new HttpException('Email already verified', HttpStatus.BAD_REQUEST);
      }
      const [otp, secret] = this.generateOtp();
      const encrypted_secret = await this.CryptoService.encryptSecret(secret);
      const updated = await this.postgresService.query<resendLinkUpdateQueryInterface>(`
        UPDATE users SET secret = $1 WHERE email = $2 RETURNING id
      `, [encrypted_secret, encrypted_email]);
      if (!updated?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const expires_in_minutes = Number(this.configService.get<string>('OTP_EXPIRES_IN_MINUTES'));
      await this.emailService.sendOtpVerificationEmail({ otp, email, full_name, expires_in_minutes });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async forgotPassword(payload: ForgotPasswordDto): Promise<void> {
    try {
      this.loggerService.log('forgotPassword {controller}');
      const { email, full_name } = payload;
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(email);
      const rows = await this.postgresService.query<ForgotPasswordQueryInterface>(
        `SELECT id FROM users WHERE email = $1`,
        [encrypted_email],
      );
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { id } = rows[0];
      const token = randomBytes(32).toString('hex');
      const ttl_seconds = Number(this.configService.get<string>('PASSWORD_RESET_EXPIRES_IN_SECONDS')) || 3600;
      await this.redisService.set(`password-reset:${token}`, String(id), ttl_seconds);
      const base_url = this.configService.get<string>('PASSWORD_RESET_URL_BASE')?.replace(/\/$/, '');
      const reset_link = base_url ? `${base_url}?token=${encodeURIComponent(token)}` : null;
      const expires_in_minutes = Math.max(1, Math.ceil(ttl_seconds / 60));
      await this.emailService.sendPasswordResetEmail({
        email,
        full_name,
        reset_link,
        expires_in_minutes,
        plain_token: reset_link ? undefined : token,
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
      const user_id = await this.redisService.get(key);
      if (!user_id) {
        this.loggerService.error('Invalid or expired token', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST);
      }
      const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
      const password_hash = await hash(new_password + pepper, 12);
      const updated = await this.postgresService.query<ResetPasswordQueryInterface>(`
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
        RETURNING id
      `, [password_hash, user_id]);
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
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(email);
      const rows = await this.postgresService.query<ChangePasswordQueryInterface>(`
        SELECT id, password_hash FROM users WHERE id = $1 AND email = $2
      `, [user_id, encrypted_email]);
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
      const new_password_hash = await hash(new_password + pepper, 12);
      const updated = await this.postgresService.query<ChangePasswordQueryInterface>(`
        UPDATE users
        SET password_hash = $1
        WHERE id = $2 AND email = $3
        RETURNING id
      `, [new_password_hash, user_id, encrypted_email]);
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
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(email);
      const rows = await this.postgresService.query<EmailVerifyQueryInterface>(`
        SELECT email_verified FROM users WHERE email = $1
      `, [encrypted_email]);
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
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(email);
      const rows = await this.postgresService.query<Update2FaGetQueryInterface>(`
        SELECT email_verified FROM users WHERE id = $1 AND email = $2
      `, [user_id, encrypted_email]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      const { email_verified } = rows[0];
      if (email_verified) {
        const updated = await this.postgresService.query<Update2FaPatchQueryInterface>(`
          UPDATE users SET two_factor_enabled = $1 WHERE id = $2 AND email = $3
          RETURNING two_factor_enabled
        `, [two_factor_enabled, user_id, encrypted_email]);
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

  async me(query: MeQueryDto): Promise<MeResult> {
    try {
      this.loggerService.log('me {controller}');
      const encrypted_email = await this.CryptoService.encryptEmailForLookup(query.email);
      const redis_key = `user:${encrypted_email}`;
      const raw = await this.redisService.get(redis_key);
      if (!raw) {
        this.loggerService.error('Session not found', HttpStatus.NOT_FOUND);
        throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
      }
      const session: MeResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      await this.redisService.del(redis_key);
      return session;
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
      secret,
      step: 60,
      digits: 4,
      window: 1,
      encoding: 'base32'
    });
    return [otp, secret];
  }

  verifyOtp(body: verifyOtpResult): boolean {
    this.loggerService.log('verifyOtp {helper}');
    const { otp, secret } = body;
    return Boolean(
      speakeasy.totp.verify({
        secret,
        step: 60,
        digits: 4,
        window: 1,
        token: otp,
        encoding: 'base32'
      }),
    );
  }
}