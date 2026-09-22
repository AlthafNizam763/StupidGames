'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/constants/routes';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { useSessionStore } from '@/stores/sessionStore';
import { FormError } from './AuthShell';

export function RegisterForm() {
  const router = useRouter();
  const register = useSessionStore((s) => s.register);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { pending, formError, fieldErrors, submit } = useFormSubmit(register);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submit({ username, email, password })) router.replace(ROUTES.home);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormError message={formError} />

      <div className="flex flex-col gap-4">
        <Input
          label="Username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          hint="3-16 characters. Letters, numbers, underscore or hyphen."
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={16}
          required
          disabled={pending}
        />

        <Input
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          autoComplete="email"
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
          hint="At least 10 characters. Length beats punctuation."
          // `new-password` tells a password manager to offer to generate one
          // rather than autofilling an existing credential.
          autoComplete="new-password"
          required
          disabled={pending}
        />

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Create account
        </Button>
      </div>
    </form>
  );
}
