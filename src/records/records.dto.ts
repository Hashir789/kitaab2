import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

export class CreateRecordItemDto {
  @Min(1)
  @IsInt()
  @Type(() => Number)
  deed_item_id: number;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @Min(1)
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  scale_item_id?: number;

  @Min(0)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  count_value?: number;
}

export class CreateRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRecordItemDto)
  records: CreateRecordItemDto[];
}