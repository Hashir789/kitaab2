import { IsNotEmpty, IsString, MinLength, IsBoolean, IsDateString, IsIn, Length, Matches, IsEmail, IsOptional } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  full_name: string;

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

export class BackofficeLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
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

export class ResendLinkDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  full_name?: string;

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

  @IsString()
  @IsNotEmpty()
  recovery_key: string;
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
  @IsNotEmpty()
  @MinLength(8)
  recovery_key: string;
}

export class update2faDto {
  @IsBoolean()
  two_factor_enabled: boolean;
}