import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class SignupVerifyOtpDto {
  
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 4)
  otp: string;

}