import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type UserAnalyticsType =
  | 'users_table'
  | 'gender_ratio'
  | 'age_distribution';

export class UserAnalyticsDto {
  @IsString()
  @IsIn(['users_table', 'gender_ratio', 'age_distribution'])
  type: UserAnalyticsType;

  @Type(() => Number)
  @Min(1)
  @IsInt()
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @Min(1)
  @IsInt()
  @Max(100)
  @IsOptional()
  limit?: number;
}