import { IsEmail } from 'class-validator';

export class IsEmailAvailableDto {

  @IsEmail()
  email: string;

}