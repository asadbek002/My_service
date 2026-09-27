'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearAccess, setAccessToken } from '../../lib/api';
import { AuthFrame } from '../../components/layout/auth-frame';

/** Landing page for the platform's support login: takes the short-lived token from the URL fragment. */
export default function Support() {
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');
    // The fragment never reaches a server; drop it from history as well.
    history.replaceState(null, '', '/support');
    if (!token) { setError('Havola noto‘g‘ri. Platforma panelidan qayta kiring.'); return; }
    clearAccess();
    setAccessToken(token, Number(params.get('expiresIn')) || 7200);
    router.replace('/dashboard');
  }, [router]);
  return (
    <AuthFrame eyebrow="Yordam rejimi" title={error ? 'Kirib bo‘lmadi' : 'Servisga kirilmoqda…'}>
      <p className="text-sm text-mute">{error || 'Bir soniya.'}</p>
    </AuthFrame>
  );
}
