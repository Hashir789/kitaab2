import { IsEmail, IsNotEmpty } from 'class-validator';

export class MeQueryDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}