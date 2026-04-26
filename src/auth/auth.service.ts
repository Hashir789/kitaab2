import { StringValue } from 'ms';
import { hash, compare } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';
import { SignupDto } from './dto/signup.dto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../logger/logger.service';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres/postgres.service';
import { signupQueryInterface, signupResult } from './interface/signup.interface';

@Injectable()
export class AuthService {

  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly loggerService: Logger,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly postgresService: PostgresService
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

  async signup(payload: SignupDto): Promise<signupResult> {
    try {
      this.loggerService.log('signup {controller}');
      const { anonymous_id, full_name: fullName, email: mail, password, gender: sex, dob: dateOfBirth } = payload;
      const pepper = this.configService.get<string>('PASSWORD_PEPPER');
      const passwordHash = await hash(password + pepper, 12);
      const rows = await this.postgresService.query<signupQueryInterface>(`
        INSERT INTO users (visitor_id, email, password_hash, full_name, gender, dob, email_verified, two_factor_enabled, last_login_at)
        SELECT v.id, $1, $2, $3, $4, $5::date, FALSE, FALSE, NOW()
        FROM visitors v
        WHERE v.anonymous_id = $6
        ON CONFLICT (email)
        DO UPDATE SET
          visitor_id = EXCLUDED.visitor_id,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          gender = EXCLUDED.gender,
          dob = EXCLUDED.dob,
          email_verified = EXCLUDED.email_verified,
          two_factor_enabled = EXCLUDED.two_factor_enabled,
          last_login_at = EXCLUDED.last_login_at
        RETURNING *;
      `, [mail, passwordHash, fullName, sex, dateOfBirth, anonymous_id]);

      if (!rows?.length) {
        throw new HttpException('Visitor not found', HttpStatus.NOT_FOUND);
      }

      const { id, full_name, email, gender, dob, two_factor_enabled, created_at } = rows[0];
      const accessToken = await this.jwtService.signAsync(rows[0]);
      const refreshExpiresIn = (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION_TIME')) as StringValue;
      const refreshToken = await this.jwtService.signAsync(
        { sub: id, email: email, type: 'refresh' },
        { expiresIn: refreshExpiresIn }
      );
      return { dob, email, gender, full_name, created_at, two_factor_enabled, access_token: accessToken, refresh_token: refreshToken };
    } catch (error) {
      this.loggerService.error(error.message, error.status ?? 500);
      throw new HttpException(error.message, error.status ?? 500);
    }
  }
}