'use client';

import { useEffect } from 'react';
import { reportError } from '../lib/report-error';

/** A page that crashed: the user can try again, and the error reaches the platform owner. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error); }, [error]);
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">Nimadir xato ketdi</h1>
      <p className="mt-2 text-sm text-mute">Xato haqida bizga avtomatik xabar keldi. Qayta urinib ko&apos;ring; takrorlansa, sahifani yangilang.</p>
      <div className="mt-5 flex gap-2">
        <button onClick={reset} className="h-11 rounded-md bg-ink px-5 text-sm font-semibold text-white">Qayta urinish</button>
        <button onClick={() => location.reload()} className="h-11 rounded-md border px-5 text-sm font-semibold">Yangilash</button>
      </div>
    </main>
  );
}
