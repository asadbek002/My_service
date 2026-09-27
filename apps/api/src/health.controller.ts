import {Controller,Get,ServiceUnavailableException}from'@nestjs/common';
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
  if(Object.values(checks).includes('failed'))throw new ServiceUnavailableException({status:'degraded',checks});
  return{status:'ok',checks};
 }
}
