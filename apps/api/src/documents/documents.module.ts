import {BadRequestException,Body,ConflictException,Controller,Get,HttpCode,Injectable,Logger,Module,NotFoundException,OnModuleDestroy,OnModuleInit,Param,Post,Res}from'@nestjs/common';
import{IsIn,IsInt,IsString,Length,Matches,Max,Min}from'class-validator';
import{CreateBucketCommand,HeadBucketCommand,HeadObjectCommand,PutObjectCommand,S3Client}from'@aws-sdk/client-s3';
import{getSignedUrl}from'@aws-sdk/s3-request-presigner';
import{PDFDocument,rgb}from'pdf-lib';
import fontkit from'@pdf-lib/fontkit';
import{readFileSync}from'node:fs';
import QRCode from'qrcode';
import type{Response}from'express';
import{Queue,Worker}from'bullmq';
import{randomUUID}from'node:crypto';
import{Prisma}from'@prisma/client';
import{Database}from'../database';
import{CurrentActor,Permissions}from'../auth/security';
import type{Actor}from'../auth/security';
import{createLink}from'../notifications/links.module';
import{orderScope,record}from'../orders/orders.module';

// Standard PDF fonts are WinAnsi-only and throw on Cyrillic/Uzbek letters; embed a Unicode TTF instead.
const fontFile=(name:string)=>readFileSync(require.resolve('dejavu-fonts-ttf/ttf/'+name));
const regularFont=fontFile('DejaVuSans.ttf'),boldFont=fontFile('DejaVuSans-Bold.ttf');

class UploadDto{
 @IsIn(['FRONT','BACK','LEFT','RIGHT','DAMAGE','OTHER'])kind!:string;
 @IsIn(['image/jpeg','image/png','image/webp'])contentType!:string;
 @IsInt()@Min(1)@Max(10485760)size!:number;
 @IsString()@Matches(/^[a-f0-9]{64}$/)sha256!:string;
}
class ConfirmDto{@IsString()@Length(1,100)uploadId!:string}
class DocumentRequestDto{@IsString()@Length(1,100)requestId!:string}

function storage(){
 const endpoint=process.env.S3_ENDPOINT,bucket=process.env.S3_BUCKET,accessKeyId=process.env.S3_ACCESS_KEY,secretAccessKey=process.env.S3_SECRET_KEY;
 if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)throw new ConflictException('Storage not configured');
 const client=(url:string)=>new S3Client({endpoint:url,region:process.env.S3_REGION??'us-east-1',forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId,secretAccessKey}});
 // Browsers upload straight to storage, so presigned URLs must use the public address (e.g. https://files.example.uz);
 // the API itself keeps talking to the internal endpoint.
 const publicEndpoint=process.env.S3_PUBLIC_ENDPOINT;
 return{bucket,client:client(endpoint),presignClient:publicEndpoint?client(publicEndpoint):client(endpoint)};
}

async function buildPdf(db:Database,organizationId:string,orderId:string,type:string):Promise<Uint8Array>{
 const order=await db.order.findFirst({where:{id:orderId,organizationId},include:{customer:true,device:true,payments:true,warranty:true}});
 if(!order)throw new NotFoundException();
 if(type==='warranty'&&!order.warranty)throw new ConflictException('Warranty not created');
 const paid=order.payments.reduce((n,p)=>p.kind==='REFUND'?n.minus(p.amount):n.plus(p.amount),new Prisma.Decimal(0));
 const snapshot={type,number:order.number,customer:order.customer.firstName,phone:order.customer.phone,device:order.device.brand+' '+order.device.model,status:order.status,total:order.total.toString(),paid:paid.toString(),balance:order.total.minus(paid).toString(),createdAt:order.createdAt.toISOString(),warrantyEnd:order.warranty?.endDate.toISOString()??null};
 const track=await createLink(db,organizationId,orderId,'TRACK');
 const pdf=await PDFDocument.create();const page=pdf.addPage([420,595]);pdf.registerFontkit(fontkit);const font=await pdf.embedFont(regularFont,{subset:true});const bold=await pdf.embedFont(boldFont,{subset:true});
 const qrData=await QRCode.toDataURL(process.env.WEB_URL+'/track/'+track,{width:180,margin:1});const qr=await pdf.embedPng(qrData);
 page.drawText('MY SERVICE',{x:34,y:548,size:22,font:bold,color:rgb(.08,.08,.08)});page.drawText(type.toUpperCase()+' DOCUMENT',{x:34,y:524,size:9,font});
 const rows=[['Order',snapshot.number],['Customer',snapshot.customer],['Phone',snapshot.phone],['Device',snapshot.device],['Status',snapshot.status],['Total',snapshot.total+' UZS'],['Paid',snapshot.paid+' UZS'],['Balance',snapshot.balance+' UZS'],...(snapshot.warrantyEnd?[['Warranty end',snapshot.warrantyEnd.slice(0,10)]]:[])] as [string,string][];
 for(const[i,row]of rows.entries()){const[k,v]=row;if(!k||!v)continue;const y=480-i*27;page.drawText(k,{x:34,y,size:9,font,color:rgb(.4,.4,.4)});page.drawText(v,{x:145,y,size:10,font:bold});}
 page.drawImage(qr,{x:250,y:40,width:130,height:130});page.drawText('Status tracking',{x:270,y:26,size:8,font});
 await db.document.create({data:{organizationId,orderId,type:type.toUpperCase(),snapshot,createdBy:'system'}});
 return pdf.save();
}

@Injectable()
export class DocumentsService implements OnModuleInit,OnModuleDestroy{
 private queue?:Queue;
 private worker?:Worker;
 private readonly logger=new Logger('Documents');
 private readonly pending=new Map<string,{resolve:(b:Buffer)=>void;reject:(e:Error)=>void}>();

 constructor(private readonly db:Database){}

 async onModuleInit(){
  await this.ensureBucket();
  if(!process.env.REDIS_URL)return;
  const url=new URL(process.env.REDIS_URL);
  const connection={host:url.hostname,port:Number(url.port||6379),...(url.password?{password:decodeURIComponent(url.password)}:{}),...(url.protocol==='rediss:'?{tls:{}}:{})};
  this.queue=new Queue('documents',{connection});
  this.worker=new Worker('documents',async job=>{
   const{requestId,organizationId,orderId,type}=job.data as{requestId:string;organizationId:string;orderId:string;type:string};
   try{
    const bytes=await buildPdf(this.db,organizationId,orderId,type);
    const buf=Buffer.from(bytes);
    this.pending.get(requestId)?.resolve(buf);
   }catch(e){
    this.pending.get(requestId)?.reject(e instanceof Error?e:new Error(String(e)));
   }finally{
    this.pending.delete(requestId);
   }
  },{connection,concurrency:4});
  this.worker.on('error',()=>this.logger.error('Document worker connection failed'));
 }

 private async ensureBucket(){
  // A fresh MinIO volume has no bucket; without it every upload and the storage health check fail.
  if(!process.env.S3_ENDPOINT||!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY||!process.env.S3_SECRET_KEY)return;
  const{client,bucket}=storage();
  try{await client.send(new HeadBucketCommand({Bucket:bucket}));}
  catch{
   try{await client.send(new CreateBucketCommand({Bucket:bucket}));this.logger.log('Created storage bucket '+bucket);}
   catch{this.logger.error('Storage bucket '+bucket+' is unavailable');}
  }
 }

 async onModuleDestroy(){
  await this.worker?.close();
  await this.queue?.close();
 }

 async generate(organizationId:string,orderId:string,type:string):Promise<Buffer>{
  // Queue mavjud bo'lsa background job orqali, aks holda synchronous
  if(this.queue){
   const requestId=randomUUID();
   const buf=await new Promise<Buffer>((resolve,reject)=>{
    this.pending.set(requestId,{resolve,reject});
    this.queue!.add('generate',{requestId,organizationId,orderId,type},{
     attempts:3,backoff:{type:'exponential',delay:2000},removeOnComplete:{age:300},removeOnFail:{age:3600}
    }).catch(e=>{this.pending.delete(requestId);reject(e);});
    setTimeout(()=>{
     if(this.pending.has(requestId)){this.pending.delete(requestId);reject(new Error('PDF_TIMEOUT'));}
    },30000);
   });
   return buf;
  }
  // Fallback: synchronous (Redis yo'q bo'lganda)
  const bytes=await buildPdf(this.db,organizationId,orderId,type);
  return Buffer.from(bytes);
 }
}

@Controller('orders')
class DocumentsController{
 constructor(private readonly db:Database,private readonly docs:DocumentsService){}

 @Post(':id/attachments/presign')@Permissions('orders.edit')
 async presign(@CurrentActor()a:Actor,@Param('id')id:string,@Body()d:UploadDto){
  const order=await this.db.order.findFirst({where:{id,...orderScope(a)}});if(!order)throw new NotFoundException();
  const ext:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const objectKey=a.organizationId+'/orders/'+order.number+'/'+randomUUID()+'.'+ext[d.contentType];
  const{presignClient,bucket}=storage();
  const pending=await this.db.pendingUpload.create({data:{organizationId:a.organizationId,orderId:id,objectKey,kind:d.kind,contentType:d.contentType,size:d.size,sha256:d.sha256,uploadedBy:a.userId,expiresAt:new Date(Date.now()+15*60000)}});
  const command=new PutObjectCommand({Bucket:bucket,Key:objectKey,ContentType:d.contentType,ContentLength:d.size,Metadata:{sha256:d.sha256}});
  return{uploadId:pending.id,url:await getSignedUrl(presignClient,command,{expiresIn:600,unhoistableHeaders:new Set(['x-amz-meta-sha256']),signableHeaders:new Set(['content-type'])}),headers:{'Content-Type':d.contentType,'x-amz-meta-sha256':d.sha256}};
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

 @Post(':id/documents/:type')@HttpCode(200)@Permissions('orders.view')
 async document(@CurrentActor()a:Actor,@Param('id')id:string,@Param('type')type:string,@Res()res:Response){
  if(!['receipt','repair','payment','warranty'].includes(type))throw new NotFoundException();
  const order=await this.db.order.findFirst({where:{id,...orderScope(a)}});if(!order)throw new NotFoundException();
  const buf=await this.docs.generate(a.organizationId,id,type);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','inline; filename="'+order.number+'-'+type+'.pdf"');
  res.setHeader('Cache-Control','private, no-store');
  res.send(buf);
 }
}

@Module({controllers:[DocumentsController],providers:[DocumentsService],exports:[DocumentsService]})
export class DocumentsModule{}
