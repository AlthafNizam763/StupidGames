import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { LoadingState } from '@/components/ui/StateBlock';

export const metadata: Metadata = { title: 'Choose a new password' };

/**
 * `useSearchParams` reads a value that only exists once the request URL is
 * known, so the component that calls it has to sit behind a Suspense boundary
 * or the whole route opts out of static rendering.
 */
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" description="This link works once.">
      <Suspense fallback={<LoadingState label="Opening reset link" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
