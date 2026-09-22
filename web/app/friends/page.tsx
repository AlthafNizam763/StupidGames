import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { FriendsScreen } from '@/components/social/FriendsScreen';

export const metadata: Metadata = { title: 'Friends' };

export default function FriendsPage() {
  return (
    <RequireSession>
      <FriendsScreen />
    </RequireSession>
  );
}
