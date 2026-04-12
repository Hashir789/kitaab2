import { MinLength, IsEmail } from 'class-validator';

export class ResetPasswordDto {
  
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}