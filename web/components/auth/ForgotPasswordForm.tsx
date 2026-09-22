'use client';

import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/constants/routes';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { authApi } from '@/services/auth';
import { FormError, FormSuccess } from './AuthShell';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const { pending, formError, fieldErrors, submit } = useFormSubmit(async (input: { email: string }) => {
    await authApi.forgotPassword(input);
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submit({ email })) setSent(true);
  }

  /*
   * The confirmation is identical whether or not the address has an account.
   * Saying "no account with that email" here would undo the server's careful
   * work to make the two cases indistinguishable (API.md).
   */
  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <FormSuccess message="If that address has an account, a reset link is on its way." />
        <p className="text-sm leading-relaxed text-ink-muted">
          The link works once and expires in an hour. Check your spam folder if it has not
          arrived in a few minutes.
        </p>
        <ButtonLink href={ROUTES.login} variant="secondary" size="md" fullWidth>
          Back to sign in
        </ButtonLink>
      </div>
    );
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
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={pending}
        />

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Send reset link
        </Button>
      </div>
    </form>
  );
}
