'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { login } from '../../lib/api';
import { loginSchema, type LoginInput } from '../../lib/schemas';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';

export default function Login() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    try {
      await login(data.login, data.password);
      router.replace('/dashboard');
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : 'Xato yuz berdi' });
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>MY SERVICE</h1>
        <p className="muted" style={{ marginTop: 8 }}>Premium Repair Service</p>
        <form onSubmit={handleSubmit(onSubmit)} style={{ marginTop: 28 }}>
          <div className="grid gap-5">
            <FormField label="Login" error={errors.login?.message} required>
              <Input {...register('login')} autoComplete="username" autoFocus placeholder="login" />
            </FormField>
            <FormField label="Parol" error={errors.password?.message} required>
              <Input {...register('password')} type="password" autoComplete="current-password" placeholder="••••••••" />
            </FormField>
            {errors.root && (
              <p role="alert" className="error">{errors.root.message}</p>
            )}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Kirilmoqda...' : 'Kirish'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
