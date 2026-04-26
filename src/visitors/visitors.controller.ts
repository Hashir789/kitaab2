import { VisitorService } from './visitors.service';
import { TrackVisitorsDto } from './dto/TrackVisitors.dto';
import { VisitorEmailsDto } from './dto/VisitorEmails.dto';
import { VisitorMessagesDto } from './dto/VisitorMessages.dto';
import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';

@Controller('visitors')
export class VisitorsController {
  
  constructor(private readonly visitorService: VisitorService) {}

  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  trackVisitor(@Body() body: TrackVisitorsDto, @Ip() ip: string) {
    return this.visitorService.trackVisitor(body, ip);
  }

  @Post('message')
  @HttpCode(HttpStatus.NO_CONTENT)
  visitorMessages(@Body() body: VisitorMessagesDto) {
    return this.visitorService.visitorMessages(body);
  }

  @Post('email')
  @HttpCode(HttpStatus.NO_CONTENT)
  visitorEmails(@Body() body: VisitorEmailsDto) {
    return this.visitorService.visitorEmails(body);
  }
}