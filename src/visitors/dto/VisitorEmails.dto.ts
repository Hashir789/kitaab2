import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VisitorEmailsDto {
  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsString()
  @IsEmail()
  email: string;
}