import { IsDateString, IsEmail, IsNotEmpty, IsString, MinLength, IsIn } from 'class-validator';

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
}