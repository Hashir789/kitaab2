import { IsNotEmpty, IsString, MinLength, IsBoolean, IsDateString, IsIn, IsOptional, Length, Matches, IsEmail } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}

export class EmailVerifyQueryDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  anonymous_id: string;
}

export class MeQueryDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class OtpVerifyDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'otp must be 4 digits' })
  otp: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class ResendLinkDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['male', 'female', 'prefer_not_to_say'])
  gender: string;

  @IsDateString()
  dob: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  recovery_key: string;
}

export class update2faDto {
  @IsBoolean()
  two_factor_enabled: boolean;
}