import { IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class VisitorEmailsDto {
  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsString()
  @IsEmail()
  email: string;
}