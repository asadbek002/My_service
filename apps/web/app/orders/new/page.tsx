'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, Flame, Laptop, Store, Truck, Monitor, Package, Plus, Smartphone, Tablet, Tv, Watch, X, type LucideIcon } from 'lucide-react';
import { api } from '../../../lib/api';
import { useCurrentBranch } from '../../../lib/branches';
import { BranchPicker } from '../../../components/branch-picker';
import { errorText } from '../../../lib/errors';
import { COURIERS, fullName, normalizePhone, phone as fmtPhone, som } from '../../../lib/format';
import { useDefaults, useOrderMutation, type Customer, type Device } from '../../../lib/queries';
import { PhotoPicker, uploadPhotos } from '../../../components/order-photos';
import { AppShell, ActionBar } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { MoneyInput } from '../../../components/ui/money-input';
import { ErrorBox } from '../../../components/ui/feedback';
import { cn } from '../../../lib/utils';
import { FormField } from '../../../components/ui/form-field';

const CATEGORIES: [string, LucideIcon][] = [['Telefon', Smartphone], ['Planshet', Tablet], ['Noutbuk', Laptop], ['Kompyuter', Monitor], ['Televizor', Tv], ['Soat', Watch], ['Boshqa', Package]];
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
  // How the device came in: brought to the counter, or sent by courier (BTS…); and whether it is urgent.
  const [intake, setIntake] = useState<'WALK_IN' | 'POST'>('WALK_IN');
  const [courier, setCourier] = useState('BTS');
  const [tracking, setTracking] = useState('');
  const [shipAddress, setShipAddress] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [labor, setLabor] = useState('');
  const [parts, setParts] = useState('');
  const [error, setError] = useState('');
  // With several branches the device is taken in at one: the header's choice, else picked here.
  const current = useCurrentBranch();
  const [pickedBranch, setPickedBranch] = useState('');
  const branchId = pickedBranch || current.branch;

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
    return api<{ id: string }>('/orders', { method: 'POST', body: JSON.stringify({ customerId: c.id, deviceId: dId, complaint: complaint.trim(), accessories, labor: labor || '0', partsTotal: parts || '0', ...(branchId ? { branchId } : {}),
      urgent, intake, ...(intake === 'POST' ? { courier, inboundTracking: tracking.trim(), shipAddress: shipAddress.trim() } : {}) }) });
  });

  const missing = useMemo(() => {
    if (current.multi && !branchId) return 'Qaysi filialda qabul qilinayotganini tanlang';
    if (!phoneValid) return 'Mijoz telefonini yozing';
    if (!customer && !firstName.trim()) return 'Mijoz ismini yozing';
    if (newDevice && (!brand.trim() || !model.trim())) return 'Qurilma brendi va modelini yozing';
    if (!complaint.trim()) return 'Nosozlikni yozing';
    return '';
  }, [current.multi, branchId, phoneValid, customer, firstName, newDevice, brand, model, complaint]);

  const { data: defaults } = useDefaults();
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (missing) { setError(missing); return; }
    setError('');
    try {
      const order = await create.mutateAsync(undefined);
      // The order is saved first; its photos follow (a failed photo never loses the order).
      let failed = 0;
      if (photos.length) { setUploading(true); failed = await uploadPhotos(order.id, photos); }
      router.replace('/orders/' + order.id + '?new=1' + (failed ? '&photos_failed=' + failed : ''));
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <AppShell title="Yangi qabul" back="/orders" narrow>
      <form onSubmit={submit} className="space-y-4 [counter-reset:step]" noValidate>
        {current.multi && <div className="rounded-2xl border bg-white px-4 py-3 sm:px-5"><BranchPicker value={branchId} onChange={setPickedBranch} /></div>}
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
                {CATEGORIES.map(([c, Icon]) => <Chip key={c} active={category === c} onClick={() => setCategory(c)}><Icon className="h-4 w-4" />{c}</Chip>)}
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

        <Section title="Qabul turi" hint="Mijoz o'zi olib keldimi yoki pochta orqali yubordimi">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qabul turi">
            <Chip active={intake === 'WALK_IN'} onClick={() => setIntake('WALK_IN')}><Store className="h-3.5 w-3.5" />Ustaxonaga keldi</Chip>
            <Chip active={intake === 'POST'} onClick={() => setIntake('POST')}><Truck className="h-3.5 w-3.5" />Pochta orqali</Chip>
          </div>
          {intake === 'POST' && (
            <div className="mt-4 grid gap-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pochta xizmati">
                {Object.entries(COURIERS).map(([k, l]) => <Chip key={k} active={courier === k} onClick={() => setCourier(k)}>{l}</Chip>)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Trek raqami" description="Ixtiyoriy: yuborilgan jo'natma raqami"><Input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Masalan: 1234567890" maxLength={60} /></FormField>
                <FormField label="Qaytarish manzili" description="Tayyor bo'lgach qayerga jo'natiladi"><Input value={shipAddress} onChange={e => setShipAddress(e.target.value)} placeholder="Shahar, tuman, BTS filiali" maxLength={300} /></FormField>
              </div>
            </div>
          )}
        </Section>

        <button type="button" role="switch" aria-checked={urgent} onClick={() => setUrgent(!urgent)}
          className={cn('flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors sm:p-5', urgent ? 'border-red-500 bg-red-50' : 'bg-white')}>
          <Flame className={cn('h-5 w-5 shrink-0', urgent ? 'text-red-600' : 'text-mute')} />
          <span className="min-w-0 flex-1">
            <span className={cn('block font-bold', urgent && 'text-red-700')}>Shoshilinch buyurtma</span>
            <span className="block text-xs text-mute">Majburiy emas. Belgilansa, ro&apos;yxatda qizil bo&apos;lib eng tepada turadi — xodimlar birinchi shuni boshlaydi.</span>
          </span>
          <span className={cn('relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors', urgent ? 'bg-red-600' : 'bg-tick')}>
            <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', urgent ? 'translate-x-[22px]' : 'translate-x-0.5')} />
          </span>
        </button>

        {defaults?.intakePhotos && (
          <Section title="Qurilma holati" hint="Tirnalgan, singan joylarini rasmga oling">
            <PhotoPicker photos={photos} onChange={setPhotos} />
          </Section>
        )}

        <Section title="Narx" hint="Keyin ham o'zgartirsa bo'ladi">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5"><span className="text-sm font-medium">Usta haqi</span><MoneyInput value={labor} onChange={setLabor} /></label>
            <label className="grid gap-1.5"><span className="text-sm font-medium">Zapchast</span><MoneyInput value={parts} onChange={setParts} /></label>
          </div>
          <div className="talon-cut -mx-4 mt-4 sm:-mx-5" />
          <div className="flex items-baseline justify-between pt-3">
            <span className="text-sm font-semibold">Jami</span>
            <span className="num font-mono text-2xl font-semibold tracking-tight">{som(total)}</span>
          </div>
        </Section>

        <ErrorBox>{error}</ErrorBox>
        <ActionBar>
          <div className="flex !flex-none flex-col justify-center pr-1 lg:hidden">
            <span className="text-[11px] text-mute">Jami</span>
            <span className="num font-mono text-[15px] font-semibold leading-tight">{total > 0 ? som(total) : '—'}</span>
          </div>
          <Button type="submit" variant="brand" size="lg" disabled={create.isPending || uploading}>{uploading ? 'Rasmlar yuklanmoqda…' : create.isPending ? 'Saqlanmoqda…' : 'Qabul qilish'}</Button>
        </ActionBar>
      </form>
    </AppShell>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="relative rounded-2xl border bg-white p-4 [counter-increment:step] sm:p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        {/* Numbered steps: the intake reads top to bottom like the paper form it replaces. */}
        <h2 className="flex items-center gap-2.5 font-bold before:flex before:h-7 before:w-7 before:shrink-0 before:items-center before:justify-center before:rounded-lg before:bg-paper before:font-mono before:text-[11px] before:font-semibold before:text-mute before:[content:counter(step,decimal-leading-zero)]">{title}</h2>
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
