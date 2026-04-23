import { IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class VisitorMessagesDto {
  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsString()
  name: string;

  @IsString()
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @IsPhoneNumber('PK')
  phone: string;

  @IsString()
  @IsOptional()
  @MinLength(10)
  message: string;
}