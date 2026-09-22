'use client';

import React, { use, useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wrench,
  DollarSign,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

type Quote = {
  number: string;
  requiredWork: string;
  total: string;
  quoteVersion: number;
};

export default function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);

  const url =
    (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api') +
    '/public/approval/' +
    encodeURIComponent(token);

  useEffect(() => {
    fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async r => {
        if (!r.ok) throw new Error('Taklif oʻzgargan yoki tasdiqlash muddati tugagan.');
        setQuote(await r.json());
      })
      .catch(e => setMessage(e.message));
  }, [token]);

  async function handleDecision(approved: boolean) {
    if (!quote) return;
    setBusy(true);
    try {
      const r = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, quoteVersion: quote.quoteVersion }),
      });
      if (!r.ok) {
        throw new Error('Qaror saqlanmadi. Havolani qayta oching yoki servisga murojaat qiling.');
      }
      setDone(true);
      setDecision(approved ? 'approved' : 'rejected');
      setMessage(
        approved
          ? "Rahmat! Narx tasdiqlandi. Tez orada taʼmirlash boshlanadi."
          : "Taklif rad etildi. Mutaxassislarimiz siz bilan bogʻlanishadi."
      );
    } catch (e: any) {
      setMessage(e.message || 'Xatolik yuz berdi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-between py-8 px-4 sm:px-6">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-1">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 items-center justify-center font-bold text-lg shadow-md mb-2">
            MS
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            MY SERVICE
          </h1>
          <p className="text-xs text-zinc-500 font-medium">
            Diagnostika va smetani tasdiqlash
          </p>
        </div>

        {done ? (
          <Card className="shadow-xl border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-4">
            {decision === 'approved' ? (
              <div className="h-16 w-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            ) : (
              <div className="h-16 w-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="h-8 w-8" />
              </div>
            )}
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {decision === 'approved' ? 'Tasdiqlandi' : 'Rad etildi'}
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{message}</p>
          </Card>
        ) : quote ? (
          <Card className="shadow-xl border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <CardHeader className="bg-zinc-900 text-white p-6 text-center">
              <span className="text-xs font-mono text-zinc-400 uppercase font-bold tracking-wider">
                Buyurtma #{quote.number}
              </span>
              <CardTitle className="text-2xl font-bold mt-1 text-white">
                {Number(quote.total).toLocaleString('uz-UZ')} soʻm
              </CardTitle>
              <CardDescription className="text-zinc-400 text-xs">
                Smeta versiyasi: v{quote.quoteVersion}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-5 text-sm">
              <div className="space-y-2">
                <span className="text-[11px] uppercase font-bold text-zinc-400 block">
                  Bajariladigan ish va xizmatlar:
                </span>
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {quote.requiredWork}
                </div>
              </div>

              {message && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg">{message}</div>
              )}

              <div className="space-y-2.5 pt-2">
                <Button
                  onClick={() => handleDecision(true)}
                  disabled={busy}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-6 text-base shadow-md"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Narxni tasdiqlayman
                </Button>

                <Button
                  variant="outline"
                  onClick={() => handleDecision(false)}
                  disabled={busy}
                  className="w-full gap-2 text-zinc-600 dark:text-zinc-400 hover:text-red-600 hover:border-red-300 py-3 text-xs"
                >
                  <XCircle className="h-4 w-4" />
                  Rad etaman
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-xs text-zinc-600">{message || 'Smeta yuklanmoqda...'}</p>
          </Card>
        )}
      </div>

      <footer className="text-center text-xs text-zinc-400 pt-8">
        MyService Platform © 2026. Barcha huquqlar himoyalangan.
      </footer>
    </div>
  );
}
