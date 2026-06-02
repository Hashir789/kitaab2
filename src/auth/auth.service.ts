import { randomBytes } from 'crypto';
import { hash, compare } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { EmailService } from '../email/email.service';
import type { AuthenticatedRequest } from './auth.interface';
import { RedisService } from '../database/redis/redis.service';
import { EncryptionService } from '../encryption/encryption.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, OtpVerifyDto, ResendLinkDto, ResetPasswordDto, SignupDto, update2faDto } from './auth.dto';
import { JwtAuthUser, loginQueryInterface, loginResult, ResetPasswordSelectQueryInterface, ResetPasswordUpdateQueryInterface, ForgotPasswordQueryInterface, ChangePasswordSelectQueryInterface, ChangePasswordUpdateQueryInterface, otpVerifyQueryInterface, EmailVerifyQueryInterface, EmailVerifyResult, signupInsertQueryInterface, Update2FaGetQueryInterface, Update2FaPatchQueryInterface, resendLinkGetQueryInterface, RefreshTokenResult, RefreshTokenQueryInterface, SignupResult } from './auth.interface';

@Injectable()
export class AuthService {

  constructor(
    private readonly loggerService: Logger,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly postgresService: PostgresService,
    private readonly encryptionService: EncryptionService
  ) {}

  // Controller functions

  async signup(payload: SignupDto): Promise<SignupResult> {
    try {
      this.loggerService.log('signup {controller}');
      const { anonymous_id, full_name, email, password, gender, dob, recovery_key } = payload;
      const pepper = this.configService.get<string>('PASSWORD_PEPPER');
      const passwordHash = await hash(password + pepper, 12);
      const vault = this.encryptionService.createVault({ password, recovery_secret: recovery_key });
      const { master_key, record: { wrapped_by_password, wrapped_by_recovery, password_salt: key_salt, recovery_salt: recovery_key_salt } } = vault;
      const password_split = this.encryptionService.splitPackedBlob(wrapped_by_password);
      const recovery_split = this.encryptionService.splitPackedBlob(wrapped_by_recovery);
      const { iv: key_iv, ciphertext: encrypted_master_key } = password_split;
      const { iv: recovery_key_iv, ciphertext: recovery_encrypted_master_key } = recovery_split;
      const full_name_encrypted = this.encryptionService.encryptField({ master_key, plaintext: full_name });
      master_key.fill(0);
      const email_hmac = this.encryptionService.hmacEmail(email);
      const expires_in_minutes = Number(this.configService.get<string>('OTP_EXPIRES_IN_MINUTES'));
      const rows = await this.postgresService.query<signupInsertQueryInterface>(`
        INSERT INTO users (visitor_id, email, password_hash, full_name, gender, dob, key_salt, key_iv, encrypted_master_key, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key, email_verified, two_factor_enabled, last_login_at)
        SELECT v.id, $1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, FALSE, FALSE, NOW()
        FROM visitors v
        WHERE v.anonymous_id = $12
        ON CONFLICT (email)
        DO NOTHING
        RETURNING id, email_verified, created_at;
      `, [ email_hmac, passwordHash, full_name_encrypted, gender, dob, key_salt, key_iv, encrypted_master_key, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key, anonymous_id ]);
      if (!rows?.length) {
        this.loggerService.error('User already exists', HttpStatus.NOT_FOUND);
        throw new HttpException('User already exists', HttpStatus.NOT_FOUND);
      }
      const { id, email_verified, created_at } = rows[0];
      const access_token = await this.jwtService.signAsync({ sub: id, email, type: 'access', email_verified });
      const otp = this.generateOtp();
      await this.storeOtpHash({ email_hmac, otp, expires_in_minutes });
      await this.emailService.sendOtpVerificationEmail({ email, full_name, otp, expires_in_minutes });
      return { dob, gender, created_at, access_token, email: email_hmac, full_name: full_name_encrypted, key_salt, key_iv, encrypted_master_key };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async refreshToken(authHeader: string | undefined): Promise<RefreshTokenResult> {
    try {
      this.loggerService.log('refreshToken {controller}');
      if (!authHeader?.startsWith('Bearer ')) {
        this.loggerService.error('Authorization header not found or malformed', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Authorization header not found or malformed', HttpStatus.UNAUTHORIZED);
      }
      const token = authHeader.split(' ')[1];
      const publicKey = this.configService.get<string>('JWT_PUBLIC_KEY') ?? '';
      const payload = (await this.jwtService.verifyAsync(token, { publicKey, algorithms: ['RS256'] }).catch(() => {
        throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
      })) as JwtAuthUser;
      if (payload?.type !== 'access') {
        this.loggerService.error('Invalid token type', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      const { sub: user_id, email } = payload;
      const email_hmac = this.encryptionService.hmacEmail(email);
      const rows = await this.postgresService.query<RefreshTokenQueryInterface>(`
        SELECT email_verified FROM users WHERE id = $1 AND email = $2
      `, [user_id, email_hmac]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      const { email_verified } = rows[0];
      const access_token = await this.jwtService.signAsync({ sub: user_id, email, type: 'access', email_verified });
      return { access_token };
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
      const email_hmac = this.encryptionService.hmacEmail(mail);
      const rows = await this.postgresService.query<loginQueryInterface>(`
        SELECT id, password_hash, full_name, email, gender, dob, created_at, two_factor_enabled, email_verified, key_salt, key_iv, encrypted_master_key
        FROM users WHERE email = $1
      `, [email_hmac]);
      if (!rows?.length) {
        this.loggerService.error('Invalid email or password', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
      }
      const { id, password_hash, dob, gender, full_name, created_at, two_factor_enabled, email_verified, key_salt, key_iv, encrypted_master_key } = rows[0];
      const hash_password = await compare(password + pepper, password_hash);
      if (!hash_password) {
        this.loggerService.error('Invalid email or password', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
      }
      await this.postgresService.query<void>(`
        UPDATE users u
        SET visitor_id = v.id, last_login_at = NOW()
        FROM visitors v
        WHERE u.id = $1 AND v.anonymous_id = $2
      `, [id, anonymous_id]);
      const access_token = await this.jwtService.signAsync({ sub: id, email: mail, type: 'access', email_verified });
      return { dob, email: email_hmac, gender, full_name, key_salt, key_iv, encrypted_master_key, created_at, email_verified, two_factor_enabled, access_token };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async otpVerify(payload: OtpVerifyDto): Promise<void> {
    try {
      this.loggerService.log('otpVerify {controller}');
      const { email, otp } = payload;
      const email_hmac = this.encryptionService.hmacEmail(email);
      const redis_key = `otp:${email_hmac}`;
      const stored = await this.redisService.get(redis_key);
      const stored_hash = stored == null ? '' : String(stored);
      if (!stored_hash || !(await compare(otp, stored_hash))) {
        this.loggerService.error('Invalid or expired code', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired code', HttpStatus.BAD_REQUEST);
      }
      const updated = await this.postgresService.query<otpVerifyQueryInterface>(`
        UPDATE users SET email_verified = TRUE WHERE email = $1 RETURNING email_verified
      `, [email_hmac]);
      if (!updated?.length) {
        this.loggerService.error('Invalid or expired code', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired code', HttpStatus.BAD_REQUEST);
      }
      await this.redisService.del(redis_key);
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async resendLink(payload: ResendLinkDto): Promise<void> {
    try {
      this.loggerService.log('resendLink {controller}');
      const { email, full_name } = payload;
      const email_hmac = this.encryptionService.hmacEmail(email);
      const rows = await this.postgresService.query<resendLinkGetQueryInterface>(`
        SELECT email_verified FROM users WHERE email = $1
      `, [email_hmac]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.NOT_FOUND);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const { email_verified } = rows[0];
      if (email_verified) {
        this.loggerService.error('Email already verified', HttpStatus.BAD_REQUEST);
        throw new HttpException('Email already verified', HttpStatus.BAD_REQUEST);
      }
      const otp = this.generateOtp();
      const expires_in_minutes = Number(this.configService.get<string>('OTP_EXPIRES_IN_MINUTES'));
      await this.storeOtpHash({ email_hmac, otp, expires_in_minutes });
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
      const email_hmac = this.encryptionService.hmacEmail(email);
      const rows = await this.postgresService.query<ForgotPasswordQueryInterface>(`
        SELECT id FROM users WHERE email = $1
      `, [email_hmac]);
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
        plain_token: reset_link ? undefined : token
      });
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      throw new HttpException(error.message, error.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async resetPassword(payload: ResetPasswordDto): Promise<void> {
    try {
      this.loggerService.log('resetPassword {controller}');
      const { token, new_password, recovery_key } = payload;
      const key = `password-reset:${token}`;
      const user_id = await this.redisService.get(key);
      if (!user_id) {
        this.loggerService.error('Invalid or expired token', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST);
      }
      const rows = await this.postgresService.query<ResetPasswordSelectQueryInterface>(`
        SELECT id, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key
        FROM users WHERE id = $1
      `, [user_id]);
      if (!rows?.length) {
        this.loggerService.error('Invalid or expired token', HttpStatus.BAD_REQUEST);
        throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST);
      }
      const { recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key } = rows[0];
      const master_key = this.encryptionService.unlockMasterKeyWithRecoveryKey({recovery_key, recovery_key_salt, recovery_key_iv, recovery_encrypted_master_key});
      if (!master_key) {
        this.loggerService.error('Invalid recovery key', HttpStatus.UNAUTHORIZED);
        throw new HttpException('Invalid recovery key', HttpStatus.UNAUTHORIZED);
      }
      const rewrapped = this.encryptionService.wrapMasterKeyWithPassword({ master_key, password: new_password });
      const { key_salt: rewrapped_key_salt, key_iv: rewrapped_key_iv, encrypted_master_key: rewrapped_encrypted_master_key } = rewrapped;
      master_key.fill(0);
      const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
      const password_hash = await hash(new_password + pepper, 12);
      const updated = await this.postgresService.query<ResetPasswordUpdateQueryInterface>(`
        UPDATE users
        SET password_hash = $1, key_salt = $2, key_iv = $3, encrypted_master_key = $4
        WHERE id = $5
        RETURNING id
      `, [password_hash, rewrapped_key_salt, rewrapped_key_iv, rewrapped_encrypted_master_key, user_id]);
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
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }
      if (current_password === new_password) {
        throw new HttpException('New password must be different from current password', HttpStatus.BAD_REQUEST);
      }
      const email_hmac = this.encryptionService.hmacEmail(email);
      const rows = await this.postgresService.query<ChangePasswordSelectQueryInterface>(`
        SELECT id, password_hash, key_salt, key_iv, encrypted_master_key
        FROM users
        WHERE id = $1 AND email = $2
      `, [user_id, email_hmac]);
      if (!rows?.length) {
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      const { password_hash, key_salt, key_iv, encrypted_master_key } = rows[0];
      const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
      const matches = await compare(current_password + pepper, password_hash);
      if (!matches) {
        throw new HttpException('Invalid current password', HttpStatus.UNAUTHORIZED);
      }
      const master_key = this.encryptionService.unlockMasterKeyWithPassword({ key_iv, key_salt, encrypted_master_key, password: current_password });
      const rewrapped = this.encryptionService.wrapMasterKeyWithPassword({ master_key, password: new_password });
      const { key_salt: rewrapped_key_salt, key_iv: rewrapped_key_iv, encrypted_master_key: rewrapped_encrypted_master_key } = rewrapped;
      master_key.fill(0);
      const new_password_hash = await hash(new_password + pepper, 12);
      const updated = await this.postgresService.query<ChangePasswordUpdateQueryInterface>(`
        UPDATE users
        SET password_hash = $1,
            key_salt = $2,
            key_iv = $3,
            encrypted_master_key = $4
        WHERE id = $5 AND email = $6
        RETURNING id
      `, [new_password_hash, rewrapped_key_salt, rewrapped_key_iv, rewrapped_encrypted_master_key, user_id, email_hmac]);
      if (!updated?.length) {
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
      const email_hmac = this.encryptionService.hmacEmail(email);
      const rows = await this.postgresService.query<EmailVerifyQueryInterface>(`
        SELECT email_verified FROM users WHERE email = $1
      `, [email_hmac]);
      return !rows?.length ? { verified: null }: { verified: rows[0].email_verified };  
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
      const email_hmac = this.encryptionService.hmacEmail(email);
      const rows = await this.postgresService.query<Update2FaGetQueryInterface>(`
        SELECT email_verified FROM users WHERE id = $1 AND email = $2
      `, [user_id, email_hmac]);
      if (!rows?.length) {
        this.loggerService.error('User not found', HttpStatus.UNAUTHORIZED);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      const { email_verified } = rows[0];
      if (email_verified) {
        const updated = await this.postgresService.query<Update2FaPatchQueryInterface>(`
          UPDATE users SET two_factor_enabled = $1 WHERE id = $2 AND email = $3
          RETURNING two_factor_enabled
        `, [two_factor_enabled, user_id, email_hmac]);
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

  generateOtp(): string {
    this.loggerService.log('generateOtp {helper}');
    const num = randomBytes(4).readUInt32BE(0) % 10000;
    return String(num).padStart(4, '0');
  }

  private async storeOtpHash(body: { email_hmac: string; otp: string; expires_in_minutes: number }): Promise<void> {
    this.loggerService.log('storeOtpHash {helper}');
    const { email_hmac, otp, expires_in_minutes } = body;
    const otp_hash = await hash(otp, 12);
    const ttl_seconds = Math.max(60, Math.floor(expires_in_minutes * 60));
    await this.redisService.set(`otp:${email_hmac}`, otp_hash, ttl_seconds);
  }
}