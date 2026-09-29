'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { fullName, normalizePhone, phone as fmtPhone, som } from '../../../lib/format';
import { useOrderMutation, type Customer, type Device } from '../../../lib/queries';
import { AppShell, ActionBar } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { MoneyInput } from '../../../components/ui/money-input';
import { ErrorBox } from '../../../components/ui/feedback';

const CATEGORIES = ['Telefon', 'Planshet', 'Noutbuk', 'Kompyuter', 'Televizor', 'Soat', 'Boshqa'];
const BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Redmi', 'Honor', 'Huawei', 'Vivo', 'Oppo', 'Realme', 'Tecno', 'Infinix', 'Google', 'Nokia', 'Lenovo', 'HP', 'Asus', 'Acer', 'Dell', 'LG'];
const ACCESSORIES = ['Quvvatlagich', 'Kabel', 'Chexol', 'SIM karta', 'Xotira kartasi', 'Quti', 'Sumka'];

export default function Page() {
  return <Suspense><NewOrder /></Suspense>;
}

function NewOrder() {
  const router = useRouter();
  // Customer (the customer page links here with ?phone= to start from a known customer)
  const initialPhone = useSearchParams().get('phone');
  const [phoneInput, setPhoneInput] = useState(initialPhone ? fmtPhone(initialPhone) : '+998 ');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [firstName, setFirstName] = useState('');
  // Device
  const [deviceId, setDeviceId] = useState<string>('');
  const [category, setCategory] = useState('Telefon');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  // Order
  const [accessories, setAccessories] = useState<string[]>([]);
  const [extraAccessory, setExtraAccessory] = useState('');
  const [complaint, setComplaint] = useState('');
  const [labor, setLabor] = useState('');
  const [parts, setParts] = useState('');
  const [error, setError] = useState('');

  const phone = normalizePhone(phoneInput);
  const digits = phone.replace(/\D/g, '');
  const phoneValid = /^\+[1-9][0-9]{7,14}$/.test(phone);
  // Look the customer up as the number is typed: a returning customer fills in by phone alone.
  const lookup = useQuery({
    queryKey: ['customers', 'lookup', digits],
    queryFn: () => api<Customer[]>('/customers?q=' + encodeURIComponent(digits.slice(-9))),
    enabled: !customer && digits.length >= 7,
  });
  const matches = customer ? [] : (lookup.data ?? []);
  useEffect(() => {
    const exact = matches.find(c => c.phone === phone);
    if (exact && phoneValid) pickCustomer(exact);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.data, phone]);

  function pickCustomer(c: Customer) {
    setCustomer(c);
    setPhoneInput(fmtPhone(c.phone));
    setDeviceId(c.devices?.[0]?.id ?? '');
  }
  function clearCustomer() {
    setCustomer(null); setDeviceId(''); setPhoneInput('+998 ');
  }
  const toggle = (item: string) => setAccessories(list => list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
  function addExtra() {
    const item = extraAccessory.trim();
    if (item && !accessories.includes(item)) setAccessories([...accessories, item]);
    setExtraAccessory('');
  }

  const total = (Number(labor) || 0) + (Number(parts) || 0);
  const devices: Device[] = customer?.devices ?? [];
  const newDevice = !deviceId;

  const create = useOrderMutation(async () => {
    // Keep what was already created, so a retry after a failed step does not duplicate the customer or device.
    let c = customer;
    if (!c) {
      c = { ...await api<Customer>('/customers', { method: 'POST', body: JSON.stringify({ firstName: firstName.trim(), phone }) }), devices: [] };
      setCustomer(c);
    }
    let dId = deviceId;
    if (!dId) {
      const device = await api<Device>('/devices', { method: 'POST', body: JSON.stringify({ customerId: c.id, category, brand: brand.trim(), model: model.trim() }) });
      dId = device.id;
      setCustomer({ ...c, devices: [...(c.devices ?? []), device] });
      setDeviceId(device.id);
    }
    return api<{ id: string }>('/orders', { method: 'POST', body: JSON.stringify({ customerId: c.id, deviceId: dId, complaint: complaint.trim(), accessories, labor: labor || '0', partsTotal: parts || '0' }) });
  });

  const missing = useMemo(() => {
    if (!phoneValid) return 'Mijoz telefonini yozing';
    if (!customer && !firstName.trim()) return 'Mijoz ismini yozing';
    if (newDevice && (!brand.trim() || !model.trim())) return 'Qurilma brendi va modelini yozing';
    if (!complaint.trim()) return 'Nosozlikni yozing';
    return '';
  }, [phoneValid, customer, firstName, newDevice, brand, model, complaint]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (missing) { setError(missing); return; }
    setError('');
    try {
      const order = await create.mutateAsync(undefined);
      router.replace('/orders/' + order.id + '?new=1');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <AppShell title="Yangi qabul" back="/orders" narrow>
      <form onSubmit={submit} className="space-y-4 [counter-reset:step]" noValidate>
        <Section title="Mijoz">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Telefon</span>
              <div className="relative">
                <Input value={phoneInput} onChange={e => { setPhoneInput(e.target.value); if (customer) setCustomer(null); }}
                  inputMode="tel" autoComplete="off" autoFocus disabled={!!customer} className="num font-mono" />
                {customer && (
                  <button type="button" onClick={clearCustomer} className="absolute inset-y-0 right-1 my-auto flex h-9 w-9 items-center justify-center rounded-md text-mute hover:text-ink" aria-label="Boshqa mijoz">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </label>
            {customer ? (
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Ism</span>
                <p className="flex h-11 items-center gap-2 rounded-md bg-emerald-50 px-3 text-sm font-medium text-emerald-800 sm:h-10">
                  <Check className="h-4 w-4 shrink-0" /><span className="truncate">{fullName(customer)}</span>
                </p>
              </div>
            ) : (
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Ism</span>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="off" autoCapitalize="words" placeholder="Yangi mijoz" />
              </label>
            )}
          </div>
          {matches.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-md border">
              <p className="bg-paper px-3 py-1.5 text-xs text-mute">Oldin kelgan mijozlar</p>
              {matches.slice(0, 5).map(c => (
                <button type="button" key={c.id} onClick={() => pickCustomer(c)} className="flex w-full items-center justify-between gap-3 border-t px-3 py-2.5 text-left text-sm hover:bg-paper">
                  <span className="truncate font-medium">{fullName(c)}</span>
                  <span className="num shrink-0 font-mono text-xs text-mute">{fmtPhone(c.phone)}</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Qurilma">
          {devices.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {devices.map(d => (
                <Chip key={d.id} active={deviceId === d.id} onClick={() => setDeviceId(d.id)}>{d.brand} {d.model}</Chip>
              ))}
              <Chip active={!deviceId} onClick={() => setDeviceId('')}><Plus className="h-3.5 w-3.5" /> Boshqa qurilma</Chip>
            </div>
          )}
          {newDevice && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Brend</span>
                  <Input value={brand} onChange={e => setBrand(e.target.value)} list="brands" autoComplete="off" autoCapitalize="words" placeholder="Samsung" />
                  <datalist id="brands">{BRANDS.map(b => <option key={b} value={b} />)}</datalist>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Model</span>
                  <Input value={model} onChange={e => setModel(e.target.value)} autoComplete="off" placeholder="A52" />
                </label>
              </div>
            </div>
          )}
        </Section>

        <Section title="Komplekt" hint="Qurilma bilan birga qoldirilgan narsalar">
          <div className="flex flex-wrap gap-2">
            {[...ACCESSORIES, ...accessories.filter(a => !ACCESSORIES.includes(a))].map(a => (
              <Chip key={a} active={accessories.includes(a)} onClick={() => toggle(a)}>{accessories.includes(a) && <Check className="h-3.5 w-3.5" />}{a}</Chip>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={extraAccessory} onChange={e => setExtraAccessory(e.target.value)} placeholder="Boshqa narsa" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} />
            <Button type="button" variant="secondary" onClick={addExtra} disabled={!extraAccessory.trim()} aria-label="Qo'shish"><Plus className="h-4 w-4" /></Button>
          </div>
        </Section>

        <Section title="Nosozlik">
          <Textarea value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="Masalan: ekran singan, zaryad olmaydi" rows={3} />
        </Section>

        <Section title="Narx" hint="Keyin ham o'zgartirsa bo'ladi">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5"><span className="text-sm font-medium">Usta haqi</span><MoneyInput value={labor} onChange={setLabor} /></label>
            <label className="grid gap-1.5"><span className="text-sm font-medium">Zapchast</span><MoneyInput value={parts} onChange={setParts} /></label>
          </div>
          <div className="talon-cut mt-4" />
          <div className="flex items-baseline justify-between pt-3">
            <span className="text-sm font-semibold">Jami</span>
            <span className="num font-mono text-xl font-semibold">{som(total)}</span>
          </div>
        </Section>

        <ErrorBox>{error}</ErrorBox>
        <ActionBar>
          <Button type="submit" variant="brand" size="lg" disabled={create.isPending}>{create.isPending ? 'Saqlanmoqda…' : 'Qabul qilish'}</Button>
        </ActionBar>
      </form>
    </AppShell>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4 [counter-increment:step] sm:p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        {/* Numbered steps: the intake reads top to bottom like the paper form it replaces. */}
        <h2 className="flex items-center gap-2.5 font-bold before:flex before:h-6 before:w-6 before:shrink-0 before:items-center before:justify-center before:rounded-full before:bg-ink before:font-mono before:text-xs before:font-semibold before:text-white before:[content:counter(step)]">{title}</h2>
        {hint && <span className="text-right text-xs text-mute">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="chip text-ink hover:border-ink/40">
      {children}
    </button>
  );
}
