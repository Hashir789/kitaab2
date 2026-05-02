import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class VisitorMessagesDto {
  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsString()
  name: string;

  @IsEmail()
  @IsString()
  email: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsOptional()
  @MinLength(10)
  message: string;
}