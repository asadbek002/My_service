import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Post, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AllowPasswordChange, CurrentActor, Public, allowedOrigins } from './security';
import type { Actor } from './security';
import { ChangePasswordDto, LoginDto, ResetDto, SignupDto, TelegramStatusDto, VerifyCodeDto, VerifySmsDto, VerifyTelegramDto } from './auth.dto';
import { PhoneVerification } from './verification';
import { TelegramClient } from '../bot/telegram.client';
import { billingSettings } from '../platform/billing';
import { Database } from '../database';
import { LoginRateGuard } from './rate-limit';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly verification: PhoneVerification, private readonly telegram: TelegramClient, private readonly db: Database) {}
  private origin(req: Request) {
    if (!req.headers.origin || !allowedOrigins().includes(req.headers.origin)) throw new ForbiddenException('Origin rejected');
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

  @Post('change-password') @AllowPasswordChange() @HttpCode(200)
  async change(@CurrentActor() actor: Actor, @Body() dto: ChangePasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    return this.send(res, await this.auth.changePassword(actor, dto.currentPassword, dto.newPassword));
  }

  // ---------- Self sign-up and password reset ----------

  /** What the sign-up page needs to know before asking anything. */
  @Get('signup/info') @Public() @Header('Cache-Control', 'no-store')
  async signupInfo() {
    const billing = await billingSettings(this.db);
    return { open: billing.signupOpen, trialDays: billing.trialDays, sms: !!(process.env.SMS_API_KEY || process.env.ESKIZ_EMAIL) || process.env.NODE_ENV !== 'production', telegram: this.telegram.enabled && !!this.telegram.username };
  }
  @Post('verify/sms') @Public() @HttpCode(200) @Header('Cache-Control', 'no-store')
  async sendCode(@Body() dto: VerifySmsDto, @Req() req: Request) {
    this.origin(req);
    const deliver = dto.purpose !== 'reset' || !!await this.db.user.findFirst({ where: { phone: dto.phone, status: 'ACTIVE' }, select: { id: true } });
    return this.verification.sendSms(dto.purpose, dto.phone, req.ip ?? '', deliver);
  }
  @Post('verify/check') @Public() @UseGuards(LoginRateGuard) @HttpCode(200) @Header('Cache-Control', 'no-store')
  async checkCode(@Body() dto: VerifyCodeDto, @Req() req: Request) {
    this.origin(req);
    return { proof: await this.verification.checkSms(dto.purpose, dto.phone, dto.code) };
  }
  @Post('verify/telegram') @Public() @HttpCode(200) @Header('Cache-Control', 'no-store')
  async telegramLink(@Body() dto: VerifyTelegramDto, @Req() req: Request) {
    this.origin(req);
    const token = await this.verification.startTelegram(dto.purpose);
    const url = this.telegram.deepLink('v_' + token);
    if (!url) throw new ServiceUnavailableException('TELEGRAM_UNAVAILABLE');
    return { token, url };
  }
  @Post('verify/telegram/status') @Public() @HttpCode(200) @Header('Cache-Control', 'no-store')
  telegramStatus(@Body() dto: TelegramStatusDto, @Req() req: Request) {
    this.origin(req);
    return this.verification.telegramStatus(dto.token);
  }
  @Post('signup') @Public() @UseGuards(LoginRateGuard) @HttpCode(201) @Header('Cache-Control', 'no-store')
  async signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    return this.send(res, await this.auth.signup(dto));
  }
  @Post('reset') @Public() @UseGuards(LoginRateGuard) @HttpCode(200) @Header('Cache-Control', 'no-store')
  async reset(@Body() dto: ResetDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    return this.send(res, await this.auth.resetPassword(dto));
  }
}
