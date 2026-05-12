import { IsIn, IsNotEmpty, IsString, Min, IsInt, IsOptional } from 'class-validator';

export class TrackVisitorsDto {
  @IsString()
  @IsNotEmpty()
  timezone: string;

  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsString()
  @IsIn(['desktop', 'tablet', 'mobile'])
  device_type: 'desktop' | 'tablet' | 'mobile';

  @Min(0)
  @IsInt()
  @IsOptional()
  clicks?: number;

  @Min(0)
  @IsInt()
  @IsOptional()
  navigations?: number;
}