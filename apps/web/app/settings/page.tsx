'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/api';
import { useMe } from '../../lib/queries';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../../components/ui/form-field';
import { Badge } from '../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';

type Template = { id: string; type: string; channel: string; body: string; active: boolean };
type Method = { id: string; key: string; label: string };
type Sub = { status: string; expiresAt: string; plan: { name: string; features: Record<string, boolean> } };
type Audit = { id: string; action: string; entityId: string | null; actorId?: string; ip?: string; createdAt: string };

const templateSchema = z.object({ body: z.string().min(10, 'Shablon kamida 10 belgi') });
const methodSchema = z.object({
  key: z.string().regex(/^[A-Z0-9_]+$/, 'Faqat katta harf, raqam va _').min(1),
  label: z.string().min(1, 'Nom majburiy'),
});
type TemplateInput = z.infer<typeof templateSchema>;
type MethodInput = z.infer<typeof methodSchema>;

export default function Settings() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();

  const { data: templates = [] } = useQuery<Template[]>({ queryKey: ['settings', 'notifications'], queryFn: () => api('/settings/notifications') });
  const { data: methods = [] } = useQuery<Method[]>({ queryKey: ['settings', 'payment-methods'], queryFn: () => api('/settings/payment-methods') });
  const { data: audit = [] } = useQuery<Audit[]>({ queryKey: ['settings', 'audit'], queryFn: () => api('/settings/audit') });
  const { data: sub } = useQuery<Sub>({ queryKey: ['settings', 'subscription'], queryFn: () => api('/settings/subscription') });

  const updateTemplate = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api('/settings/notifications/' + id, { method: 'PUT', body: JSON.stringify({ body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'notifications'] }),
  });
  const addMethod = useMutation({
    mutationFn: (d: MethodInput) => api('/settings/payment-methods/' + encodeURIComponent(d.key), { method: 'PUT', body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', 'payment-methods'] }); methodForm.reset(); },
  });

  const methodForm = useForm<MethodInput>({ resolver: zodResolver(methodSchema) });

  return (
    <main className="page">
      <header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/orders">Buyurtmalar</Link></header>
      <div className="title-row"><div><p className="eyebrow">TIZIM</p><h1>Sozlamalar</h1></div></div>

      {/* Obuna */}
      {sub && (
        <Card style={{ marginBottom: 24 }}>
          <CardHeader><CardTitle>{sub.plan.name}</CardTitle></CardHeader>
          <CardContent>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <Badge variant={sub.status === 'ACTIVE' ? 'success' : sub.status === 'TRIAL' ? 'warning' : 'danger'}>{sub.status}</Badge>
              <span style={{ fontSize: 13, color: '#666' }}>{new Date(sub.expiresAt).toLocaleDateString('uz-UZ')} gacha</span>
            </div>
            <p style={{ fontSize: 13, color: '#666' }}>
              {Object.entries(sub.plan.features).filter(([, v]) => v).map(([k]) => k).join(' · ')}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="detail-grid">
        {/* Navigatsiya */}
        <Card>
          <CardHeader><CardTitle>Sahifalar</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {([
                ['/settings/general', 'Umumiy sozlamalar'],
                ['/settings/roles', 'Rollar va ruxsatlar'],
                ['/settings/notifications', 'Xabarnoma shablonlar'],
                ['/settings/telegram', 'Telegram bot'],
                ['/settings/sms', 'SMS sozlamalari'],
                ['/settings/subscription', 'Obuna'],
                ['/branches', 'Filiallar'],
              ] as const).map(([href, label]) => (
                <Link key={href} href={href}>
                  <Button variant="secondary" size="sm" className="w-full" style={{ justifyContent: 'flex-start' }}>{label}</Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* To'lov usullari */}
        <Card>
          <CardHeader><CardTitle>To'lov usullari</CardTitle></CardHeader>
          <CardContent>
            {methods.map(m => (
              <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 14 }}>
                {m.label} <Badge variant="default">{m.key}</Badge>
              </div>
            ))}
            <form onSubmit={methodForm.handleSubmit(d => addMethod.mutate(d))} className="grid gap-3" style={{ marginTop: 16 }}>
              <FormField label="Kalit" error={methodForm.formState.errors.key?.message} required>
                <Input {...methodForm.register('key')} placeholder="UZCARD_QR" />
              </FormField>
              <FormField label="Nomi" error={methodForm.formState.errors.label?.message} required>
                <Input {...methodForm.register('label')} placeholder="UzCard QR" />
              </FormField>
              <Button type="submit" size="sm" disabled={addMethod.isPending}>Qo'shish</Button>
            </form>
          </CardContent>
        </Card>

        {/* Xabarnoma shablonlar */}
        <Card>
          <CardHeader><CardTitle>Xabarnoma shablonlar</CardTitle></CardHeader>
          <CardContent>
            {templates.map(t => (
              <div key={t.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13 }}>
                  <strong>{t.type}</strong>
                  <Badge variant="default">{t.channel}</Badge>
                  <Badge variant={t.active ? 'success' : 'default'}>{t.active ? 'FAOL' : 'NOFAOL'}</Badge>
                </div>
                <form onSubmit={e => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget as HTMLFormElement);
                  updateTemplate.mutate({ id: t.id, body: String(d.get('body')) });
                }} className="grid gap-2">
                  <Textarea name="body" defaultValue={t.body} rows={3} />
                  <Button type="submit" size="sm" variant="secondary" disabled={updateTemplate.isPending}>Saqlash</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Audit log */}
        <Card>
          <CardHeader><CardTitle>Audit log</CardTitle></CardHeader>
          <CardContent>
            <div className="audit-list">
              {audit.slice(0, 30).map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 12 }}>
                  <p style={{ color: '#777' }}>{new Date(a.createdAt).toLocaleString('uz-UZ')}{a.ip ? ` · ${a.ip}` : ''}</p>
                  <p><strong>{a.action}</strong>{a.entityId ? ` — ${a.entityId.slice(0, 12)}` : ''}</p>
                </div>
              ))}
              {audit.length === 0 && <p className="muted">Audit yozuvlar yo'q.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
