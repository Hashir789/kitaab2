import { IsIn, IsNotEmpty, IsString } from 'class-validator';

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
}