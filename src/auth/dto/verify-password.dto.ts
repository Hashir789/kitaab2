import { IsNotEmpty, MinLength } from 'class-validator';

export class VerifyPasswordDto {

  @MinLength(8)
  password: string;
}