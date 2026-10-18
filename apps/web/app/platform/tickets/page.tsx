'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PlatformConsole from '../console';

function Tickets() { return <PlatformConsole tab="tickets" ticketId={useSearchParams().get('open')} />; }
export default function Page() { return <Suspense><Tickets /></Suspense>; }
