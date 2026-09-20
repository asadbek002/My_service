'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
type Customer={id:string;firstName:string;phone:string;notes?:string};
export default function Customers(){const router=useRouter();const[items,setItems]=useState<Customer[]>([]);const[error,setError]=useState('');
useEffect(()=>{api<Customer[]>('/customers').then(setItems).catch(e=>e instanceof Error&&e.message==='SESSION_EXPIRED'?router.replace('/login'):setError(e instanceof Error?e.message:'Xato'));},[]);
return <main className="page"><header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/orders">Buyurtmalar</Link></header><div className="title-row"><div><p className="eyebrow">CRM</p><h1>Mijozlar</h1></div><Link className="nav-link" href="/orders">+ Yangi qabul</Link></div>{error&&<p className="error">{error}</p>}<section><div className="table-scroll"><table><thead><tr><th>Ism</th><th>Telefon</th><th>Izoh</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td><Link href={'/customers/'+x.id}>{x.firstName}</Link></td><td>{x.phone}</td><td>{x.notes??'—'}</td></tr>)}</tbody></table></div>{!items.length&&<p className="muted">Mijozlar topilmadi.</p>}</section></main>}
