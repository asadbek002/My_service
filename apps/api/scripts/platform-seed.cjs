require('dotenv').config({path:require('node:path').resolve(__dirname,'../../../.env')});
const {PrismaClient}=require('@prisma/client');const argon2=require('argon2');const db=new PrismaClient();
async function main(){
 const login=process.env.INITIAL_PLATFORM_ADMIN_LOGIN?.toLowerCase();const password=process.env.INITIAL_PLATFORM_ADMIN_PASSWORD;
 if(!login||!password||password.length<16)throw new Error('Platform login and 16+ character password required');
 if(await db.platformAdmin.findUnique({where:{login}})){console.log('Platform admin exists; no changes');return;}
 await db.platformAdmin.create({data:{login,passwordHash:await argon2.hash(password,{type:argon2.argon2id})}});console.log('Platform admin created');
}
main().catch(()=>{console.error('Platform seed failed; check environment');process.exitCode=1;}).finally(()=>db.$disconnect());
