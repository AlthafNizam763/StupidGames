'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/constants/routes';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { useSessionStore } from '@/stores/sessionStore';
import { FormError } from './AuthShell';

export function LoginForm() {
  const router = useRouter();
  const login = useSessionStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { pending, formError, fieldErrors, submit } = useFormSubmit(login);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submit({ email, password })) router.replace(ROUTES.home);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormError message={formError} />

      <div className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          autoComplete="email"
          // Browsers and password managers rely on these to offer the right
          // credentials, and mobile keyboards use inputMode to drop the
          // spacebar for an @ key.
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={pending}
        />

        <Input
          label="Password"
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          autoComplete="current-password"
          required
          disabled={pending}
        />

        <div className="-mt-1 text-right">
          <Link
            href={ROUTES.forgotPassword}
            className="inline-flex touch-target items-center px-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Sign in
        </Button>
      </div>
    </form>
  );
}
