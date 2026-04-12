import { IsEmail, IsString, Length } from 'class-validator';

export class OtpVerifyDto {

  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 4)
  otp: string;
  
}