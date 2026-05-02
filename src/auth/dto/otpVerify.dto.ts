import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

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