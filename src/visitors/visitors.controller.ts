import { VisitorService } from './visitors.service';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TrackVisitorsDto, VisitorEmailsDto, VisitorMessagesDto } from './visitors.dto';

@Controller('visitors')
export class VisitorsController {
  
  constructor(private readonly visitorService: VisitorService) {}

  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  trackVisitor(@Body() body: TrackVisitorsDto) {
    return this.visitorService.trackVisitor(body);
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