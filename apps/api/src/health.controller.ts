import {Controller,Get,ServiceUnavailableException}from'@nestjs/common';
import{HeadBucketCommand,S3Client}from'@aws-sdk/client-s3';
import Redis from'ioredis';
import{Public}from'./auth/security';
import{Database}from'./database';
@Controller('health')
export class HealthController{
 constructor(private readonly db:Database){}
 @Get()@Public()
 async health(){
  const checks:Record<string,string>={api:'ok'};
  try{await this.db.$queryRaw`SELECT 1`;checks.database='ok'}catch{checks.database='failed'}
  const redis=new Redis(process.env.REDIS_URL!,{lazyConnect:true,maxRetriesPerRequest:0,connectTimeout:2000});
  try{await redis.connect();await redis.ping();checks.redis='ok'}catch{checks.redis='failed'}finally{redis.disconnect()}
  if(process.env.S3_ENDPOINT&&process.env.S3_BUCKET&&process.env.S3_ACCESS_KEY&&process.env.S3_SECRET_KEY){
   try{const client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION??'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY,secretAccessKey:process.env.S3_SECRET_KEY}});await client.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET}));checks.storage='ok'}catch{checks.storage='failed'}
  }else checks.storage='not_configured';
  if(Object.values(checks).includes('failed'))throw new ServiceUnavailableException({status:'degraded',checks});
  return{status:'ok',checks};
 }
}
