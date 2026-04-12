import { IsDateString, IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsNotEmpty()
  @IsString()
  gender: string;

  @IsDateString()
  birthday: string;
}
