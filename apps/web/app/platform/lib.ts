'use client';
const base=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001/api';
export async function platformLogin(login:string,password:string){
 const r=await fetch(base+'/platform/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password}),cache:'no-store'});
 if(!r.ok)throw new Error('Login yoki parol noto‘g‘ri');const data=await r.json();sessionStorage.setItem('platform_token',data.accessToken);
}
export async function platformApi<T>(path:string,options:RequestInit={}):Promise<T>{
 const token=sessionStorage.getItem('platform_token');if(!token)throw new Error('SESSION_EXPIRED');
 const r=await fetch(base+'/platform'+path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',...options.headers,Authorization:'Bearer '+token}});
 if(r.status===401){sessionStorage.removeItem('platform_token');throw new Error('SESSION_EXPIRED');}
 if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.message??'So‘rov bajarilmadi');}
 return r.status===204?undefined as T:r.json();
}
