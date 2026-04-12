import { Logger } from './logger.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [Logger],
  exports: [Logger],
})

export class LoggerModule {}