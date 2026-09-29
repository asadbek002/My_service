'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, login } from '../../lib/api';
import { loginSchema, type LoginInput } from '../../lib/schemas';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { ErrorBox } from '../../components/ui/feedback';
import { AuthFrame } from '../../components/layout/auth-frame';

// Each failure has a different fix, so say which one it is.
function loginError(e: unknown) {
  const status = e instanceof ApiError ? e.status : 0;
  const message = e instanceof Error ? e.message : '';
  if (status === 401) return "Login yoki parol noto'g'ri";
  if (status === 429) return "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring.";
  if (status === 403 && message === 'Origin rejected') return 'Sayt manzili server sozlamasiga mos emas (WEB_URL / CORS_ORIGINS). Administratorga murojaat qiling.';
  if (status === 400) return "Login faqat lotin harflari, raqam va _ . - belgilaridan iborat bo'lishi kerak";
  if (status >= 500 || status === 0) return "Server bilan bog'lanib bo'lmadi. Keyinroq urinib ko'ring.";
  return message || 'Xato yuz berdi';
}

export default function Login() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    try {
      await login(data.login, data.password);
      router.replace('/dashboard');
    } catch (e) {
      setError('root', { message: loginError(e) });
    }
  }

  return (
    <AuthFrame eyebrow="Servisga kirish" title="Xush kelibsiz">
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormField label="Login" error={errors.login?.message}>
          <Input {...register('login')} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
        </FormField>
        <FormField label="Parol" error={errors.password?.message}>
          <Input {...register('password')} type="password" autoComplete="current-password" />
        </FormField>
        <ErrorBox>{errors.root?.message}</ErrorBox>
        <Button type="submit" variant="brand" size="lg" disabled={isSubmitting} className="w-full">{isSubmitting ? 'Kirilmoqda…' : 'Kirish'}</Button>
        <p className="text-xs text-mute">Parolni unutdingizmi? Boshliq yoki xodim uni &laquo;Xodimlar&raquo; bo&apos;limida yangilab beradi.</p>
      </form>
    </AuthFrame>
  );
}
