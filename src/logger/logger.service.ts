import * as winston from 'winston';
import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class Logger implements LoggerService {

  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }: winston.Logform.TransformableInfo) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: 'logs/app.log',
          options: { flags: 'w' },
        }),
      ],
    });
  }

  log(message: string): void {
    this.logger.info(message);
  }

  error(message: string, status: number): void {
    this.logger.error(`${message} (${status})`);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  debug(message: string): void {
    this.logger.debug(message);
  }

  verbose(message: string): void {
    this.logger.verbose(message);
  }
}