import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendLinkDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}