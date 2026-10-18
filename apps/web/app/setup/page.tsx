'use client';

import { useState } from 'react';
import Link from 'next/link';
import { errorText } from '../../lib/errors';
import { useBranding, useMe } from '../../lib/queries';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { ErrorBox, Loading } from '../../components/ui/feedback';
import { SetupBar, StepRow, SupportLink, useDismissSetup, useSetup } from '../../components/setup-steps';

/** Getting started: the steps a new workshop takes, each a link to where it is done. */
export default function SetupPage() {
  const { data: me } = useMe();
  const { data: brand } = useBranding(!!me);
  const { data, error, isLoading } = useSetup();
  const dismiss = useDismissSetup();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState('');
  const finished = !!data && data.done >= data.total;
  return (
    <AppShell title="Sozlash" back="/dashboard" narrow>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={4} /> : (
        <div className="space-y-4">
          <section className="talon-dark on-ink overflow-hidden p-5 sm:p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/60">{brand?.name ?? 'Ustaxona'}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{finished ? 'Hammasi sozlandi!' : `Xush kelibsiz${me ? ', ' + me.firstName : ''}!`}</p>
            <p className="mt-1 text-sm text-white/70">{finished ? 'Ustaxonangiz ishga tayyor.' : 'Bir necha qadamda ustaxonangizni sozlang. Istalgan qadamni keyinroq qilsa ham bo‘ladi.'}</p>
            <div className="mt-4 flex items-center gap-3">
              <SetupBar setup={data} className="flex-1 [&>span]:bg-white/15 [&>span.bg-st-tayyor]:bg-[#33C47A]" />
              <span className="num shrink-0 font-mono text-sm font-semibold">{data.done}/{data.total}</span>
            </div>
          </section>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-white">
            {data.steps.map((s, i) => <StepRow key={s.key} k={s.key} done={s.done} index={i} />)}
          </ul>
          <SupportLink />
          <ErrorBox>{state}</ErrorBox>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="brand" size="lg" className="sm:flex-1"><Link href={finished ? '/orders/new' : '/dashboard'}>{finished ? 'Yangi qabul' : 'Bosh sahifaga'}</Link></Button>
            {!data.dismissed && !finished && (
              <Button variant="secondary" size="lg" disabled={busy} onClick={async () => { setBusy(true); try { await dismiss(); } catch (e) { setState(errorText(e)); } finally { setBusy(false); } }}>Bosh sahifada ko&apos;rsatmaslik</Button>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
