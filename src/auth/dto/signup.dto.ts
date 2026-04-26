import { IsDateString, IsEmail, IsNotEmpty, IsString, MinLength, IsIn } from 'class-validator';

export class SignupDto {
  @IsNotEmpty()
  @IsString()
  anonymous_id: string;

  @IsNotEmpty()
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['male', 'female', 'prefer_not_to_say'])
  gender: string;

  @IsDateString()
  dob: string;
}