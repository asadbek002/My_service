'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewOrder() {
  const router = useRouter();
  useEffect(() => { router.replace('/orders?new=1'); }, [router]);
  return null;
}
