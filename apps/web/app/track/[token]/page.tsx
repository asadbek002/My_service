'use client';

import React, { use, useEffect, useState } from 'react';
import {
  Smartphone,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldCheck,
  CreditCard,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

type Tracking = {
  number: string;
  status: string;
  device: string;
  total: string;
  balance: string;
  receivedAt: string;
  warrantyEnd: string | null;
};

export default function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(
      (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api') +
        '/public/track/' +
        encodeURIComponent(token),
      { cache: 'no-store', referrerPolicy: 'no-referrer' }
    )
      .then(async r => {
        if (!r.ok) throw new Error('Havola topilmadi yoki muddati tugagan.');
        setData(await r.json());
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-between py-8 px-4 sm:px-6">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Header / Logo */}
        <div className="text-center space-y-1">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 items-center justify-center font-bold text-lg shadow-md mb-2">
            MS
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            MY SERVICE
          </h1>
          <p className="text-xs text-zinc-500 font-medium">Qurilma taʼmirlash holati</p>
        </div>

        {loading ? (
          <Card className="shadow-lg border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-400">
            Maʼlumotlar tekshirilmoqda...
          </Card>
        ) : error ? (
          <Card className="shadow-lg border-red-200 dark:border-red-900 p-6 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
            <h3 className="font-bold text-sm text-red-900 dark:text-red-200">Xatolik</h3>
            <p className="text-xs text-zinc-500">{error}</p>
          </Card>
        ) : data ? (
          <Card className="shadow-xl border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* Status Highlight Banner */}
            <div className="bg-zinc-900 text-white p-6 text-center space-y-2">
              <span className="font-mono text-xs text-zinc-400 font-bold tracking-wider uppercase block">
                Buyurtma #{data.number}
              </span>
              <h2 className="text-2xl font-bold tracking-tight">{data.device}</h2>
              <div className="pt-2">
                <StatusBadge status={data.status} className="bg-zinc-800 text-white border-zinc-700" />
              </div>
            </div>

            <CardContent className="p-6 space-y-5 text-sm">
              {/* Financial snapshot */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-100 dark:border-zinc-800">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                    Xizmat narxi
                  </span>
                  <span className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                    {Number(data.total || 0).toLocaleString('uz-UZ')} soʻm
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                    Toʻlanishi kerak
                  </span>
                  <span
                    className={`font-bold text-base ${
                      Number(data.balance || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
                    }`}
                  >
                    {Number(data.balance || 0).toLocaleString('uz-UZ')} soʻm
                  </span>
                </div>
              </div>

              {/* Timeline details */}
              <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-400">
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-zinc-400" />
                    Qabul qilingan sana:
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {new Date(data.receivedAt).toLocaleDateString('uz-UZ')}
                  </span>
                </div>

                {data.warrantyEnd && (
                  <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <ShieldCheck className="h-4 w-4" />
                      Kafolat muddati:
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {new Date(data.warrantyEnd).toLocaleDateString('uz-UZ')} gacha
                    </span>
                  </div>
                )}
              </div>

              {/* Assistance Box */}
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg text-xs text-zinc-500 text-center">
                Savollar boʻyicha servis markazingiz bilan bogʻlaning.
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-zinc-400 pt-8">
        MyService Platform © 2026. Barcha huquqlar himoyalangan.
      </footer>
    </div>
  );
}
