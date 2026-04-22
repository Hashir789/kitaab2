import { Logger } from './logger.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  exports: [Logger],
  providers: [Logger]
})

export class LoggerModule {}