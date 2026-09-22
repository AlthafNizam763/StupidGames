import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { RedirectIfAuthenticated } from '@/components/auth/SessionGuards';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <RedirectIfAuthenticated>
      <AuthShell
        title="Join the crew"
        description="Pick a name the rest of the station will know you by."
        footer={
          <>
            Already have an account?{' '}
            <Link href={ROUTES.login} className="text-signal underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <RegisterForm />
      </AuthShell>
    </RedirectIfAuthenticated>
  );
}
