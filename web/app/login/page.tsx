import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { RedirectIfAuthenticated } from '@/components/auth/SessionGuards';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <RedirectIfAuthenticated>
      <AuthShell
        title="Sign in"
        description="Return to the station."
        footer={
          <>
            No account yet?{' '}
            <Link href={ROUTES.register} className="text-signal underline-offset-4 hover:underline">
              Create one
            </Link>
          </>
        }
      >
        <LoginForm />
      </AuthShell>
    </RedirectIfAuthenticated>
  );
}
