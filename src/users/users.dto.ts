import { Type } from 'class-transformer';
import type { UserAnalyticsType } from './users.interface';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class UserAnalyticsDto {
  @IsString()
  @IsIn(['users_table', 'gender_ratio', 'age_distribution', 'visitors_association'])
  type: UserAnalyticsType;

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