import { IsBoolean } from 'class-validator';

export class Toggle2FaDto {
  
  @IsBoolean()
  toggle: boolean;

}