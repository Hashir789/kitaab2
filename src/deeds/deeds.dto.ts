import { Type } from 'class-transformer';
import type { HideType } from './deeds.interface';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, Max, ValidateNested } from 'class-validator';

export class CreateDeedItemDto {
  @Min(1)
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  parent_deed_item_id?: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Min(0)
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  display_order?: number;

  @IsString()
  @IsOptional()
  @IsIn(['none', 'hide_from_all', 'hide_from_graphs'])
  hide_type?: HideType;

  @IsArray()
  @IsOptional()
  @Type(() => CreateDeedItemDto)
  @ValidateNested({ each: true })
  children?: CreateDeedItemDto[];
}

export class ReorderDeedItemsDto {
  @Min(1)
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  parent_deed_item_id?: number;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  display_order: number[];
}