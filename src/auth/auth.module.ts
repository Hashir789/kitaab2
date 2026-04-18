import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { StringValue } from 'ms';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const publicKey = configService.get<string>('JWT_PUBLIC_KEY');
        const privateKey = configService.get<string>('JWT_PRIVATE_KEY');
        const expiresIn = (configService.get<string>('ACCESS_TOKEN_EXPIRATION_TIME') || '1h') as StringValue;

        return {
          privateKey,
          publicKey,
          signOptions: {
            algorithm: 'RS256',
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})

export class AuthModule {}