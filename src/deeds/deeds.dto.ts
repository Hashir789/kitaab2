import { Type } from 'class-transformer';
import type { DeedAnalyticsType, HideType } from './deeds.interface';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, Max, IsEnum, ValidateNested } from 'class-validator';

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

export class UpdateDeedItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['none', 'hide_from_all', 'hide_from_graphs'])
  hide_type?: HideType;
}

export class DeedAnalyticsDto {
  @IsString()
  @IsIn(['deeds_table', 'category', 'users_association', 'visitors_association', 'parent_deed_association'])
  type: DeedAnalyticsType;

  @IsInt()
  @IsNotEmpty()
  @IsOptional()
  @Type(() => Number)
  id?: string;

  @Min(1)
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @Min(1)
  @IsInt()
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}