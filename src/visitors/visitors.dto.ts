import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, Min, Max, IsInt, IsOptional, MinLength, IsEmail } from 'class-validator';

export type VisitorAnalyticsType =
  | 'summary'
  | 'users_association'
  | 'messages_association'
  | 'emails_association'
  | 'visitors_table'
  | 'visitor_messages_table'
  | 'visitor_emails_table';

export class VisitorAnalyticsDto {
  @IsString()
  @IsIn([
    'summary',
    'users_association',
    'messages_association',
    'emails_association',
    'visitors_table',
    'visitor_messages_table',
    'visitor_emails_table'
  ])
  type: VisitorAnalyticsType;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  anonymous_id?: string;

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