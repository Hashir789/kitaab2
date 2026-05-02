import { IsEmail, IsNotEmpty } from 'class-validator';

export class EmailVerifyQueryDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}