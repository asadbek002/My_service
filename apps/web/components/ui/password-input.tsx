'use client';
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';

/** A password field with a show/hide button, so it is typed once and checked by eye instead of twice. */
export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [shown, setShown] = React.useState(false);
  return (
    <div className="relative">
      <Input ref={ref} {...props} type={shown ? 'text' : 'password'} className="pr-12" />
      <button type="button" onClick={() => setShown(v => !v)} aria-label={shown ? 'Parolni yashirish' : "Parolni ko'rsatish"} aria-pressed={shown}
        className="absolute inset-y-0 right-1 my-auto flex h-9 w-10 items-center justify-center rounded-md text-mute hover:text-ink">
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
