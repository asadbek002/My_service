import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecurityGuard } from './security';
import { LoginRateGuard } from './rate-limit';

@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET! }) })],
  providers: [AuthService, LoginRateGuard, { provide: APP_GUARD, useClass: SecurityGuard }],
  controllers: [AuthController],
})
export class AuthModule {}
