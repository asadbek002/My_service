import{BadRequestException,Body,Controller,Get,Module,Param,Put}from'@nestjs/common';
import{IsBoolean,IsObject,IsString,Length,Matches}from'class-validator';
import{Prisma}from'@prisma/client';
import{Database}from'../database';
import{TelegramClient}from'../bot/telegram.client';
import{CurrentActor,Permissions}from'../auth/security';
import type{Actor}from'../auth/security';
class SettingsDto{@IsObject()value!:Record<string,unknown>}
class TemplateDto{@IsString()@Length(1,4000)body!:string;@IsBoolean()active!:boolean}
class PaymentMethodDto{@IsString()@Length(1,64)@Matches(/^[A-Z0-9_]+$/)key!:string;@IsString()@Length(1,100)label!:string}
@Controller('settings')
class SettingsController{
 constructor(private readonly db:Database){}
 @Get('notifications')@Permissions('settings.manage')
 notifications(@CurrentActor()a:Actor){return this.db.notificationTemplate.findMany({where:{organizationId:a.organizationId}})}
 @Put('notifications/:type/:channel')@Permissions('settings.manage')
 async notification(@CurrentActor()a:Actor,@Param('type')type:string,@Param('channel')channel:string,@Body()d:TemplateDto){
  const types=['ORDER_READY'];
  if(!types.includes(type)||!['TELEGRAM','SMS'].includes(channel))throw new BadRequestException();
  const variables=[...d.body.matchAll(/{{([a-z_]+)}}/g)].map(x=>x[1]);
  const allowed=['customer_name','order_number','device','repair','price','paid','balance','status','warranty_end','link'];
  if(variables.some(x=>!x||!allowed.includes(x)))throw new BadRequestException('Unknown template variable');
  const result=await this.db.notificationTemplate.upsert({where:{organizationId_type_channel:{organizationId:a.organizationId,type,channel}},create:{organizationId:a.organizationId,type,channel,body:d.body,active:d.active},update:{body:d.body,active:d.active}});
  await this.db.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,action:'NOTIFICATION_TEMPLATE_CHANGED',entityId:result.id}});return result;
 }
 @Get('payment-methods')
 paymentMethods(@CurrentActor()a:Actor){return this.db.paymentMethod.findMany({where:{organizationId:a.organizationId,active:true}})}
 @Put('payment-methods/:key')@Permissions('settings.manage')
 async paymentMethod(@CurrentActor()a:Actor,@Param('key')key:string,@Body()d:PaymentMethodDto){
  if(key!==d.key)throw new BadRequestException();
  return this.db.paymentMethod.upsert({where:{organizationId_key:{organizationId:a.organizationId,key}},create:{organizationId:a.organizationId,key,label:d.label},update:{label:d.label,active:true}});
 }
 // Non-sensitive defaults every staff member needs (expense form, delivery form, receipt).
 @Get('defaults')
 async defaults(@CurrentActor()a:Actor){
  const rows=await this.db.organizationSetting.findMany({where:{organizationId:a.organizationId,key:{in:['warranty_terms','expense_categories','receipt']}}});
  const value=(key:string)=>rows.find(r=>r.key===key)?.value as Record<string,unknown>|undefined;
  const items=value('expense_categories')?.items;
  const categories=Array.isArray(items)?items.filter((x):x is string=>typeof x==='string'&&x.trim().length>0):[];
  const text=value('warranty_terms')?.text;
  return{warrantyTerms:typeof text==='string'?text:'',expenseCategories:categories.length?categories:['RENT','SALARY','DELIVERY','ADVERTISEMENT','UTILITY','TRANSPORT','PURCHASE','OTHER'],receiptWidth:value('receipt')?.width===58?58:80};
 }
 @Get('telegram')@Permissions('settings.manage')
 async telegram(@CurrentActor()a:Actor){
  const [linked,total]=await Promise.all([this.db.customer.count({where:{organizationId:a.organizationId,telegramChatId:{not:null}}}),this.db.customer.count({where:{organizationId:a.organizationId}})]);
  const tg=new TelegramClient();
  return{botConfigured:tg.enabled,botUsername:tg.username,webhookConfigured:!!process.env.TELEGRAM_WEBHOOK_SECRET,linkedCustomers:linked,totalCustomers:total};
 }
 @Get('subscription')subscription(@CurrentActor()a:Actor){return this.db.subscription.findUnique({where:{organizationId:a.organizationId},include:{plan:true}})}
 @Get('general')@Permissions('settings.manage')
 general(@CurrentActor()a:Actor){return this.db.organizationSetting.findMany({where:{organizationId:a.organizationId}})}
 @Put('general/:key')@Permissions('settings.manage')
 async setting(@CurrentActor()a:Actor,@Param('key')key:string,@Body()d:SettingsDto){
  if(!['general','expense_categories','warranty_terms','receipt','bot_contact'].includes(key))throw new BadRequestException('Unknown setting');
  if(JSON.stringify(d.value).length>16000)throw new BadRequestException('Setting too large');
  const result=await this.db.organizationSetting.upsert({where:{organizationId_key:{organizationId:a.organizationId,key}},create:{organizationId:a.organizationId,key,value:d.value as Prisma.InputJsonObject},update:{value:d.value as Prisma.InputJsonObject}});
  await this.db.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,action:'SETTING_CHANGED',entityId:key}});return result;
 }
 @Get('audit')@Permissions('staff.manage')
 audit(@CurrentActor()a:Actor){return this.db.auditLog.findMany({where:{organizationId:a.organizationId},orderBy:{createdAt:'desc'},take:100})}
}
@Module({controllers:[SettingsController]})export class SettingsModule{}
