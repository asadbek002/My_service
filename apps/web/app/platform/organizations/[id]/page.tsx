'use client';
import { useParams } from 'next/navigation';
import PlatformConsole from '../../console';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PlatformConsole tab="organizations" orgId={id} />;
}
