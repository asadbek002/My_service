'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { useParams,useRouter } from 'next/navigation';
import { api } from '../../lib/api';
type Payment={kind:string;amount:string};type Order={id:string;number:string;status:string;total:string;device:{brand:string;model:string};payments:Payment[]};
type Customer={id:string;firstName:string;phone:string;notes?:string;telegramChatId?:string;devices:{id:string;brand:string;model:string;imei?:string}[];orders:Order[]};
export default function CustomerPage(){const{id}=useParams<{id:string}>();const router=useRouter();const[item,setItem]=useState<Customer|null>(null);const[error,setError]=useState('');
useEffect(()=>{api<Customer>('/customers/'+id).then(setItem).catch(e=>e instanceof Error&&e.message==='SESSION_EXPIRED'?router.replace('/login'):setError(e instanceof Error?e.message:'Xato'));},[id]);
if(!item)return <main className="page"><p>{error||'Yuklanmoqda…'}</p></main>;
const paid=item.orders.flatMap(o=>o.payments).reduce((n,p)=>n+(p.kind==='REFUND'?-1:1)*Number(p.amount),0);const total=item.orders.reduce((n,o)=>n+Number(o.total),0);
return <main className="page"><header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/customers">Mijozlar</Link></header><p className="eyebrow">MIJOZ PROFILI</p><h1>{item.firstName}</h1><div className="cards"><section><span className="muted">Telefon</span><strong className="metric-text">{item.phone}</strong></section><section><span className="muted">Telegram</span><strong>{item.telegramChatId?'✓':'—'}</strong></section><section><span className="muted">Murojaatlar</span><strong>{item.orders.length}</strong></section><section><span className="muted">Qarzdorlik</span><strong>{Math.max(0,total-paid).toLocaleString('uz-UZ')}</strong></section></div><div className="detail-grid"><section><h2>Qurilmalar</h2>{item.devices.map(d=><p key={d.id}><Link href={'/devices/'+d.id}>{d.brand} {d.model}</Link><small>{d.imei||'IMEI kiritilmagan'}</small></p>)}</section><section><h2>Buyurtmalar</h2>{item.orders.map(o=><p key={o.id}><Link href={'/orders/'+o.id}>{o.number}</Link> · {o.device.brand} {o.device.model}<small>{o.status} · {Number(o.total).toLocaleString('uz-UZ')} so‘m</small></p>)}</section></div></main>}
