'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/constants/routes';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { authApi } from '@/services/auth';
import { FormError, FormSuccess } from './AuthShell';

export function ResetPasswordForm() {
  // The token arrives in the emailed link. It is never shown or typed.
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  const { pending, formError, fieldErrors, submit } = useFormSubmit(
    async (input: { token: string; password: string }) => {
      await authApi.resetPassword(input);
    },
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submit({ token, password })) setDone(true);
  }

  // A link with no token cannot work, so say so instead of showing a form that
  // is guaranteed to fail on submit.
  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <FormError message="This reset link is incomplete. Request a new one." />
        <ButtonLink href={ROUTES.forgotPassword} size="md" fullWidth>
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormSuccess message="Password updated." />
        <ButtonLink href={ROUTES.login} size="md" fullWidth>
          Sign in
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormError message={formError ?? fieldErrors.token ?? null} />

      <div className="flex flex-col gap-4">
        <Input
          label="New password"
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint="At least 10 characters."
          autoComplete="new-password"
          required
          disabled={pending}
        />

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Update password
        </Button>
      </div>
    </form>
  );
}
