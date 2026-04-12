import { IsEmail } from 'class-validator';

export class sendOtpDto {

  @IsEmail()
  email: string;
  
}