'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCustomers, useMe, useCreateCustomer } from '../../lib/queries';
import { customerSchema, type CustomerInput } from '../../lib/schemas';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { FormField } from '../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';

export default function Customers() {
  const router = useRouter();
  const { data: me, error: meError } = useMe();
  const { data: customers = [], isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { notificationPreference: 'AUTO' },
  });

  if (meError?.message === 'SESSION_EXPIRED') { router.replace('/login'); return null; }

  async function onSubmit(data: CustomerInput) {
    try { await createCustomer.mutateAsync(data); reset(); } catch {}
  }

  return (
    <main className="page">
      <header>
        <Link href="/dashboard" className="brand">MY SERVICE</Link>
        <Link href="/dashboard">Bosh sahifa</Link>
      </header>
      <div className="title-row">
        <div><p className="eyebrow">BAZASI</p><h1>Mijozlar</h1></div>
      </div>

      <div className="staff-layout">
        <section>
          {isLoading ? <p className="muted">Yuklanmoqda...</p> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Ism</th><th>Telefon</th><th>Telegram</th><th></th></tr></thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id}>
                      <td>{c.firstName} {c.lastName ?? ''}</td>
                      <td>{c.phone}</td>
                      <td>{c.telegramChatId ? '🟢 Ulangan' : c.telegramUsername ? '@' + c.telegramUsername : '—'}</td>
                      <td><Link href={'/customers/' + c.id}><Button variant="ghost" size="sm">Ko'rish</Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {customers.length === 0 && <p className="muted">Mijozlar yo'q.</p>}
            </div>
          )}
        </section>

        {me?.permissions.includes('customers.edit') && (
          <Card>
            <CardHeader><CardTitle>Yangi mijoz</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
                <FormField label="Ism" error={errors.firstName?.message} required>
                  <Input {...register('firstName')} placeholder="Aziz" />
                </FormField>
                <FormField label="Familiya" error={errors.lastName?.message}>
                  <Input {...register('lastName')} placeholder="Valiyev" />
                </FormField>
                <FormField label="Telefon" error={errors.phone?.message} required>
                  <Input {...register('phone')} placeholder="+998901234567" />
                </FormField>
                <FormField label="Telegram" error={errors.telegramUsername?.message}>
                  <Input {...register('telegramUsername')} placeholder="@username" />
                </FormField>
                <FormField label="Xabar kanali" error={errors.notificationPreference?.message}>
                  <Select {...register('notificationPreference')}>
                    <option value="AUTO">Avtomatik</option>
                    <option value="TELEGRAM">Telegram</option>
                    <option value="SMS">SMS</option>
                  </Select>
                </FormField>
                {createCustomer.error && <p role="alert" className="error">{createCustomer.error.message}</p>}
                <Button type="submit" disabled={createCustomer.isPending}>
                  {createCustomer.isPending ? 'Saqlanmoqda...' : 'Mijoz qo\'shish'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
