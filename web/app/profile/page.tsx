import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { ProfileScreen } from '@/components/profile/ProfileScreen';

export const metadata: Metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <RequireSession>
      <ProfileScreen />
    </RequireSession>
  );
}
