import { IsBoolean, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class update2faDto {
  @IsBoolean()
  two_factor_enabled: boolean;
}
