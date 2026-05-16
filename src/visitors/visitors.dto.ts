import { IsIn, IsNotEmpty, IsString, Min, IsInt, IsOptional, MinLength, IsEmail } from 'class-validator';

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

export class VisitorEmailsDto {
  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsEmail()
  @IsString()
  email: string;
}

export class VisitorMessagesDto {
  @IsString()
  @IsNotEmpty()
  anonymous_id: string;

  @IsString()
  name: string;

  @IsEmail()
  @IsString()
  email: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsOptional()
  @MinLength(10)
  message: string;
}