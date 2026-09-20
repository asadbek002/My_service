import {BadRequestException,Body,ConflictException,Controller,Get,Module,NotFoundException,Param,Post,Res}from'@nestjs/common';
import{IsIn,IsInt,IsString,Length,Matches,Max,Min}from'class-validator';
import{HeadObjectCommand,PutObjectCommand,S3Client}from'@aws-sdk/client-s3';
import{getSignedUrl}from'@aws-sdk/s3-request-presigner';
import{PDFDocument,StandardFonts,rgb}from'pdf-lib';
import QRCode from'qrcode';
import type{Response}from'express';
import{randomUUID}from'node:crypto';
import{Prisma}from'@prisma/client';
import{Database}from'../database';
import{CurrentActor,Permissions}from'../auth/security';
import type{Actor}from'../auth/security';
import{createLink}from'../notifications/links.module';
import{orderScope,record}from'../orders/orders.module';
class UploadDto{
 @IsIn(['FRONT','BACK','LEFT','RIGHT','DAMAGE','OTHER'])kind!:string;
 @IsIn(['image/jpeg','image/png','image/webp'])contentType!:string;
 @IsInt()@Min(1)@Max(10485760)size!:number;
 @IsString()@Matches(/^[a-f0-9]{64}$/)sha256!:string;
}
class ConfirmDto{@IsString()@Length(1,100)uploadId!:string}
function storage(){
 const endpoint=process.env.S3_ENDPOINT,bucket=process.env.S3_BUCKET,accessKeyId=process.env.S3_ACCESS_KEY,secretAccessKey=process.env.S3_SECRET_KEY;
 if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)throw new ConflictException('Storage not configured');
 return{bucket,client:new S3Client({endpoint,region:process.env.S3_REGION??'us-east-1',forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}})};
}
@Controller('orders')
class DocumentsController{
 constructor(private readonly db:Database){}
 @Post(':id/attachments/presign')@Permissions('orders.edit')
 async presign(@CurrentActor()a:Actor,@Param('id')id:string,@Body()d:UploadDto){
  const order=await this.db.order.findFirst({where:{id,...orderScope(a)}});if(!order)throw new NotFoundException();
  const ext:{[key:string]:string}={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const objectKey=a.organizationId+'/orders/'+order.number+'/'+randomUUID()+'.'+ext[d.contentType];
  const pending=await this.db.pendingUpload.create({data:{organizationId:a.organizationId,orderId:id,objectKey,kind:d.kind,contentType:d.contentType,size:d.size,sha256:d.sha256,uploadedBy:a.userId,expiresAt:new Date(Date.now()+15*60000)}});
  const{client,bucket}=storage();const command=new PutObjectCommand({Bucket:bucket,Key:objectKey,ContentType:d.contentType,ContentLength:d.size,Metadata:{sha256:d.sha256}});
  return{uploadId:pending.id,url:await getSignedUrl(client,command,{expiresIn:600}),headers:{'Content-Type':d.contentType,'x-amz-meta-sha256':d.sha256}};
 }
 @Post(':id/attachments/confirm')@Permissions('orders.edit')
 async confirm(@CurrentActor()a:Actor,@Param('id')id:string,@Body()d:ConfirmDto){
  const pending=await this.db.pendingUpload.findFirst({where:{id:d.uploadId,organizationId:a.organizationId,orderId:id}});
  if(!pending||pending.expiresAt<=new Date())throw new NotFoundException();
  const order=await this.db.order.findFirst({where:{id,...orderScope(a)}});if(!order)throw new NotFoundException();
  const{client,bucket}=storage();const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:pending.objectKey}));
  if(head.ContentLength!==pending.size||head.ContentType!==pending.contentType||head.Metadata?.sha256!==pending.sha256)throw new BadRequestException('Uploaded object metadata mismatch');
  return this.db.$transaction(async tx=>{
   const attachment=await tx.attachment.create({data:{organizationId:a.organizationId,orderId:id,objectKey:pending.objectKey,kind:pending.kind,contentType:pending.contentType,size:pending.size,sha256:pending.sha256,uploadedBy:a.userId}});
   await tx.pendingUpload.delete({where:{id:pending.id}});await record(tx,a,id,'ATTACHMENT_CONFIRMED');return attachment;
  });
 }
 @Get(':id/attachments')@Permissions('orders.view')
 async attachments(@CurrentActor()a:Actor,@Param('id')id:string){
  if(!await this.db.order.findFirst({where:{id,...orderScope(a)}}))throw new NotFoundException();
  return this.db.attachment.findMany({where:{organizationId:a.organizationId,orderId:id},select:{id:true,kind:true,contentType:true,size:true,createdAt:true}});
 }
 @Get(':id/documents/:type')@Permissions('orders.view')
 async document(@CurrentActor()a:Actor,@Param('id')id:string,@Param('type')type:string,@Res()res:Response){
  if(!['receipt','repair','payment','warranty'].includes(type))throw new NotFoundException();
  const order=await this.db.order.findFirst({where:{id,...orderScope(a)},include:{customer:true,device:true,payments:true,warranty:true}});
  if(!order)throw new NotFoundException();
  if(type==='warranty'&&!order.warranty)throw new ConflictException('Warranty not created');
  const paid=order.payments.reduce((n,p)=>p.kind==='REFUND'?n.minus(p.amount):n.plus(p.amount),new Prisma.Decimal(0));
  const snapshot={type,number:order.number,customer:order.customer.firstName,phone:order.customer.phone,device:order.device.brand+' '+order.device.model,status:order.status,total:order.total.toString(),paid:paid.toString(),balance:order.total.minus(paid).toString(),createdAt:order.createdAt.toISOString(),warrantyEnd:order.warranty?.endDate.toISOString()??null};
  const track=await createLink(this.db,a.organizationId,id,'TRACK');
  const pdf=await PDFDocument.create();const page=pdf.addPage([420,595]);const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrData=await QRCode.toDataURL(process.env.WEB_URL+'/track/'+track,{width:180,margin:1});const qr=await pdf.embedPng(qrData);
  page.drawText('MY SERVICE',{x:34,y:548,size:22,font:bold,color:rgb(.08,.08,.08)});page.drawText(type.toUpperCase()+' DOCUMENT',{x:34,y:524,size:9,font});
  const rows=[['Order',snapshot.number],['Customer',snapshot.customer],['Phone',snapshot.phone],['Device',snapshot.device],['Status',snapshot.status],['Total',snapshot.total+' UZS'],['Paid',snapshot.paid+' UZS'],['Balance',snapshot.balance+' UZS'],...(snapshot.warrantyEnd?[['Warranty end',snapshot.warrantyEnd.slice(0,10)]]:[])];
  for(const[i,row]of rows.entries()){const k=row[0],v=row[1];if(!k||!v)continue;const y=480-i*27;page.drawText(k,{x:34,y,size:9,font,color:rgb(.4,.4,.4)});page.drawText(v,{x:145,y,size:10,font:bold});}
  page.drawImage(qr,{x:250,y:40,width:130,height:130});page.drawText('Status tracking',{x:270,y:26,size:8,font});
  await this.db.document.create({data:{organizationId:a.organizationId,orderId:id,type:type.toUpperCase(),snapshot,createdBy:a.userId}});
  const bytes=await pdf.save();res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="'+order.number+'-'+type+'.pdf"');res.setHeader('Cache-Control','private, no-store');res.send(Buffer.from(bytes));
 }
}
@Module({controllers:[DocumentsController]})
export class DocumentsModule{}
