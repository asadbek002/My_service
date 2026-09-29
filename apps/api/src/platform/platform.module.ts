import { Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Module, Param, Patch, Post, Req, UseGuards, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IsString, Length, Matches, IsInt, Min, IsOptional, IsObject, IsIn, IsISO8601 } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Database } from '../database';
import { Public, allowedOrigins } from '../auth/security';
import { LoginRateGuard } from '../auth/rate-limit';
import { LoginDto } from '../auth/auth.dto';
import { SubscriptionCache } from '../auth/subscription-cache';
import { ALL_PERMISSIONS } from '../auth/permissions';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { BotModule } from '../bot/bot.module';
import { BotService } from '../bot/bot.service';
import { esc } from '../bot/telegram.client';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
type AdminRequest = Request & { adminId: string; platformSessionId: string };
@Injectable()
class PlatformGuard implements CanActivate {
  constructor(private readonly db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token || token.length > 200) throw new UnauthorizedException();
    const session = await this.db.platformSession.findUnique({ where: { tokenHash: hash(token) }, include: { admin: true } });
    if (!session || !session.admin.active || session.expiresAt <= new Date()) throw new UnauthorizedException();
    req.adminId = session.adminId; req.platformSessionId = session.id; return true;
  }
}
class PlanDto {
  @IsString() @Length(1,100) name!: string;
  @IsOptional() @IsInt() @Min(1) maxBranches?: number;
  @IsOptional() @IsInt() @Min(1) maxStaff?: number;
  @IsOptional() @IsInt() @Min(1) monthlyOrders?: number;
  @IsOptional() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) monthlyPrice?: string;
  @IsObject() features!: Record<string, boolean>;
}
class OrganizationDto {
  @IsString() @Length(1,200) name!: string;
  @IsString() @Matches(/^[a-z0-9-]{3,64}$/) slug!: string;
  @IsString() @Length(1,100) planId!: string;
  @IsString() @Matches(/^[a-zA-Z0-9_.-]{3,64}$/) login!: string;
  @IsString() @Length(12,128) temporaryPassword!: string;
  @IsString() @Length(1,100) ownerName!: string;
  @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
}
class ResetPasswordDto {
  @IsString() @Length(12,128) temporaryPassword!: string;
}
class SubscriptionDto {
  @IsString() @Length(1,100) planId!: string;
  @IsIn(['TRIAL','ACTIVE','SUSPENDED','EXPIRED']) status!: string;
  @IsISO8601() expiresAt!: string;
}
// Simplified product: the owner and staff share every business permission.
const rolePermissions: Record<string, readonly string[]> = { OWNER: ALL_PERMISSIONS, STAFF: ALL_PERMISSIONS };
@Controller('platform/auth') @Public()
class PlatformAuthController {
  constructor(private readonly db: Database) {}
  @Post('login') @UseGuards(LoginRateGuard)
  async login(@Req() req: Request, @Body() d: LoginDto) {
    if (!req.headers.origin || !allowedOrigins().includes(req.headers.origin)) throw new ForbiddenException();
    const admin = await this.db.platformAdmin.findUnique({ where: { login: d.login.toLowerCase() } });
    // Always do Argon2 work for unknown users.
    const dummy = '$argon2id$v=19$m=65536,t=3,p=4$cmFuZG9tLXNlZWQtc2FsdA$R5sjIzDcudFDASNkKMjGNgpdsmaOoE1ZeInDz5Cyb1U';
    let valid = false;
    try { valid = await argon2.verify(admin?.passwordHash ?? dummy, d.password); } catch {}
    if (!admin || !admin.active || !valid) throw new UnauthorizedException('Invalid credentials');
    const token = randomBytes(32).toString('base64url');
    await this.db.platformSession.create({ data: { adminId: admin.id, tokenHash: hash(token), expiresAt: new Date(Date.now()+8*3600000) } });
    return { accessToken: token, expiresIn: 28800 };
  }
  @Post('logout') @UseGuards(PlatformGuard)
  async logout(@Req() req: AdminRequest) { await this.db.platformSession.delete({ where: { id: req.platformSessionId } }); return { ok: true }; }
}
@Controller('platform') @Public() @UseGuards(PlatformGuard)
class PlatformController {
  constructor(private readonly db: Database, private readonly subCache: SubscriptionCache, private readonly jwt: JwtService, private readonly bot: BotService) {}
  @Get('organizations')
  organizations() {
    return this.db.organization.findMany({ select: { id:true,name:true,slug:true,createdAt:true,subscription:{include:{plan:true}},_count:{select:{users:true,branches:true,orders:true}} }, take:100, orderBy:{createdAt:'desc'} });
  }
  @Get('plans')
  plans() { return this.db.plan.findMany({ orderBy:{name:'asc'} }); }
  @Post('plans')
  async plan(@Body() d: PlanDto, @Req() req: AdminRequest) {
    const allowed=['inventory','telegram','sms','advanced_reports','multi_branch','staff_commission','exports'];
    if (Object.entries(d.features).some(([k,v])=>!allowed.includes(k)||typeof v!=='boolean')) throw new BadRequestException('Unknown feature or non-boolean value');
    try {
      return await this.db.$transaction(async tx => {
        const plan=await tx.plan.create({data:{name:d.name,features:d.features as Prisma.InputJsonObject,maxBranches:d.maxBranches??null,maxStaff:d.maxStaff??null,monthlyOrders:d.monthlyOrders??null,monthlyPrice:d.monthlyPrice??'0'}});
        await tx.auditLog.create({data:{organizationId:'PLATFORM',actorId:req.adminId,action:'PLAN_CREATED',entityId:plan.id}});return plan;
      });
    } catch(e) { if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002') throw new ConflictException('Plan name exists');throw e; }
  }
  @Post('organizations')
  async onboard(@Body() d: OrganizationDto, @Req() req: AdminRequest) {
    const passwordHash=await argon2.hash(d.temporaryPassword,{type:argon2.argon2id});
    try {
      const created = await this.db.$transaction(async tx => {
        if(!await tx.plan.findUnique({where:{id:d.planId}})) throw new NotFoundException('Plan not found');
        const org=await tx.organization.create({data:{name:d.name,slug:d.slug}});
        const branch=await tx.branch.create({data:{organizationId:org.id,name:'Asosiy filial'}});
        const user=await tx.user.create({data:{organizationId:org.id,login:d.login.toLowerCase(),firstName:d.ownerName,phone:d.phone,passwordHash,mustChangePassword:true}});
        await tx.userBranch.create({data:{organizationId:org.id,userId:user.id,branchId:branch.id}});
        for(const [systemKey,keys] of Object.entries(rolePermissions)){
          const role=await tx.role.create({data:{organizationId:org.id,name:systemKey,systemKey}});
          for(const key of keys){
            const permission=await tx.permission.upsert({where:{key},create:{key},update:{}});
            await tx.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
          }
          if(systemKey==='OWNER')await tx.userRole.create({data:{organizationId:org.id,userId:user.id,roleId:role.id}});
        }
        await tx.subscription.create({data:{organizationId:org.id,planId:d.planId,expiresAt:new Date(Date.now()+14*86400000)}});
        await tx.auditLog.create({data:{organizationId:org.id,actorId:req.adminId,action:'PLATFORM_ORGANIZATION_CREATED',entityId:org.id}});
        return {id:org.id,name:org.name,ownerLogin:user.login};
      },{timeout:15000});
      void this.bot.notifyAdmins(`🆕 Yangi servis: <b>${esc(created.name)}</b> (egasi: ${esc(created.ownerLogin)}, ${esc(d.phone)})`).catch(() => undefined);
      return created;
    } catch(e) { if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002') throw new ConflictException('Organization slug or login exists');throw e; }
  }
  @Patch('organizations/:id/subscription')
  async subscription(@Param('id')id:string,@Body()d:SubscriptionDto,@Req()req:AdminRequest) {
    if(!await this.db.plan.findUnique({where:{id:d.planId}})) throw new NotFoundException('Plan not found');
    if(!await this.db.organization.findUnique({where:{id}})) throw new NotFoundException();
    return this.db.$transaction(async tx=>{
      const sub=await tx.subscription.upsert({where:{organizationId:id},create:{organizationId:id,planId:d.planId,status:d.status,expiresAt:new Date(d.expiresAt)},update:{planId:d.planId,status:d.status,expiresAt:new Date(d.expiresAt),graceUntil:null}});
      await tx.auditLog.create({data:{organizationId:id,actorId:req.adminId,action:'SUBSCRIPTION_CHANGED',entityId:sub.id}});
      await this.subCache.invalidate(id);
      return sub;
    });
  }
  @Get('organizations/:id/users')
  async users(@Param('id') id: string) {
    if (!await this.db.organization.findUnique({ where: { id } })) throw new NotFoundException();
    return this.db.user.findMany({ where: { organizationId: id }, select: { id: true, login: true, firstName: true, lastName: true, phone: true, status: true, mustChangePassword: true, roles: { select: { role: { select: { systemKey: true } } } } }, orderBy: { createdAt: 'asc' } });
  }
  // Platform support: reset any member's password (it becomes temporary) and end their sessions.
  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() d: ResetPasswordDto, @Req() req: AdminRequest) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    const passwordHash = await argon2.hash(d.temporaryPassword, { type: argon2.argon2id });
    await this.db.$transaction([
      this.db.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
      this.db.session.updateMany({ where: { userId: id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } }),
      this.db.auditLog.create({ data: { organizationId: user.organizationId, actorId: 'platform:' + req.adminId, action: 'PLATFORM_PASSWORD_RESET', entityId: id } }),
    ]);
    return { ok: true, login: user.login };
  }
  // Platform support: enter an organization as its owner to investigate and fix problems.
  // Short-lived (2 h), no refresh token, and audited in the organization's own log.
  @Post('organizations/:id/support')
  async support(@Param('id') id: string, @Req() req: AdminRequest) {
    const owner = await this.db.user.findFirst({ where: { organizationId: id, status: 'ACTIVE', roles: { some: { role: { systemKey: 'OWNER' } } } }, orderBy: { createdAt: 'asc' } });
    if (!owner) throw new NotFoundException('Active owner not found');
    const sessionId = randomBytes(16).toString('hex');
    await this.db.$transaction([
      this.db.session.create({ data: { id: sessionId, userId: owner.id, tokenFamilyId: 'support:' + sessionId, refreshTokenHash: hash(randomBytes(32).toString('hex')), expiresAt: new Date(Date.now() + 2 * 3600000) } }),
      this.db.auditLog.create({ data: { organizationId: id, actorId: 'platform:' + req.adminId, action: 'PLATFORM_SUPPORT_LOGIN', entityId: owner.id } }),
    ]);
    const accessToken = await this.jwt.signAsync({ sub: owner.id, sid: sessionId }, { algorithm: 'HS256', issuer: 'myservice', audience: 'myservice-api', expiresIn: '2h' });
    return { accessToken, expiresIn: 7200, owner: { login: owner.login, firstName: owner.firstName } };
  }
  // ---- Telegram bot ----
  /** Bot health as Telegram sees it: token, username, webhook URL and pending errors. */
  @Get('bot')
  async botStatus(@Req() req: AdminRequest) {
    const admin = await this.db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId }, select: { telegramChatId: true } });
    const info = await this.bot.telegram.call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo', {});
    return {
      configured: this.bot.telegram.enabled, username: this.bot.telegram.username, secretSet: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      expectedUrl: process.env.WEB_URL ? process.env.WEB_URL.replace(/\/$/, '') + '/api/telegram/webhook' : null,
      webhook: info.ok ? info.result : null, adminLinked: !!admin.telegramChatId,
      customersLinked: await this.db.customer.count({ where: { telegramChatId: { not: null } } }),
      staffLinked: await this.db.user.count({ where: { telegramChatId: { not: null } } }),
    };
  }
  /** Register the webhook and the command menu with Telegram (run once after setting the token). */
  @Post('bot/setup')
  async botSetup() {
    if (!this.bot.telegram.enabled) throw new BadRequestException('TELEGRAM_BOT_TOKEN is not set');
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || !process.env.WEB_URL) throw new BadRequestException('TELEGRAM_WEBHOOK_SECRET and WEB_URL are required');
    const url = process.env.WEB_URL.replace(/\/$/, '') + '/api/telegram/webhook';
    const hook = await this.bot.telegram.call('setWebhook', { url, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: false });
    if (!hook.ok) throw new BadRequestException('setWebhook: ' + (hook.description ?? hook.status));
    await this.bot.telegram.call('setMyCommands', { commands: [
      { command: 'start', description: 'Boshlash' }, { command: 'orders', description: 'Buyurtmalarim' },
      { command: 'warranty', description: 'Kafolatlarim' }, { command: 'help', description: 'Yordam' }, { command: 'stop', description: "Xabarlarni o'chirish" },
    ] });
    await this.bot.telegram.call('setMyDescription', { description: "Qurilmangiz ta'mirini kuzating: holat, narx, kafolat. Telefon raqamingizni yuboring — buyurtmalaringizni topamiz." });
    return { ok: true, url };
  }
  /** One-time link that connects this admin's Telegram. */
  @Post('bot/link')
  async botLink(@Req() req: AdminRequest) {
    const url = await this.bot.connectLink('ADMIN', req.adminId);
    if (!url) throw new BadRequestException('TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are required');
    return { url };
  }
  @Get('analytics')
  async analytics() {
    const now=new Date(),since=new Date(Date.now()-30*86400000);
    const [totalOrganizations,newOrganizations,activeSubscriptions,trials,churned,active] = await Promise.all([
      this.db.organization.count(),this.db.organization.count({where:{createdAt:{gte:since}}}),
      this.db.subscription.count({where:{status:'ACTIVE',expiresAt:{gt:now}}}),this.db.subscription.count({where:{status:'TRIAL',expiresAt:{gt:now}}}),
      this.db.subscription.count({where:{status:{in:['SUSPENDED','EXPIRED']}}}),
      this.db.subscription.findMany({where:{status:'ACTIVE',expiresAt:{gt:now}},include:{plan:true}}),
    ]);
    const mrr=active.reduce((sum,item)=>sum.plus(item.plan.monthlyPrice),new Prisma.Decimal(0));
    return {totalOrganizations,activeOrganizations:activeSubscriptions+trials,activeSubscriptions,trials,newOrganizations,churned,churnRate:totalOrganizations?Number((churned/totalOrganizations*100).toFixed(2)):0,mrr};
  }
  @Get('invoices')
  invoices(){return this.db.subscriptionInvoice.findMany({orderBy:{issuedAt:'desc'},take:100})}
  @Get('usage')
  usage(){return this.db.usageRecord.findMany({orderBy:{period:'desc'},take:200})}
  @Get('system')
  async system() { await this.db.$queryRaw`SELECT 1`; return {database:'ok',organizations:await this.db.organization.count(),activeSubscriptions:await this.db.subscription.count({where:{status:'ACTIVE',expiresAt:{gt:new Date()}}}),pendingOutbox:await this.db.outboxEvent.count({where:{publishedAt:null}}),failedNotifications:await this.db.notification.count({where:{status:'FAILED'}})}; }
}
@Module({imports:[BotModule,JwtModule.registerAsync({useFactory:()=>({secret:process.env.JWT_ACCESS_SECRET!})})],controllers:[PlatformAuthController,PlatformController],providers:[PlatformGuard,LoginRateGuard,SubscriptionCache]})
export class PlatformModule {}
