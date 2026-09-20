import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AllowPasswordChange, CurrentActor, Public } from './security';
import type { Actor } from './security';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { LoginRateGuard } from './rate-limit';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private origin(req: Request) {
    if (req.headers.origin !== process.env.WEB_URL) throw new ForbiddenException('Origin rejected');
  }
  private cookieOptions() {
    return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth' };
  }
  private send(res: Response, result: Awaited<ReturnType<AuthService['login']>>) {
    res.cookie('myservice_refresh', result.refreshToken, { ...this.cookieOptions(), expires: result.expiresAt });
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }
  @Post('login') @Public() @UseGuards(LoginRateGuard) @HttpCode(200) @Header('Cache-Control', 'no-store')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    return this.send(res, await this.auth.login(dto.login, dto.password));
  }
  @Post('refresh') @Public() @UseGuards(LoginRateGuard) @HttpCode(200) @Header('Cache-Control', 'no-store')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    return this.send(res, await this.auth.refresh(req.cookies?.myservice_refresh));
  }
  @Post('logout') @AllowPasswordChange() @HttpCode(204)
  async logout(@CurrentActor() actor: Actor, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    await this.auth.logout(actor);
    res.clearCookie('myservice_refresh', this.cookieOptions());
  }
  @Get('me') @AllowPasswordChange() @Header('Cache-Control', 'no-store')
  me(@CurrentActor() actor: Actor) { return this.auth.me(actor); }

  @Post('change-password') @AllowPasswordChange() @HttpCode(204)
  async change(@CurrentActor() actor: Actor, @Body() dto: ChangePasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    await this.auth.changePassword(actor, dto.currentPassword, dto.newPassword);
    res.clearCookie('myservice_refresh', this.cookieOptions());
  }
}
