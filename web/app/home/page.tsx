import type { Metadata } from 'next';
import { HomeScreen } from '@/components/home/HomeScreen';
import { RequireSession } from '@/components/auth/SessionGuards';

export const metadata: Metadata = { title: 'Home' };

export default function HomePage() {
  return (
    <RequireSession>
      <HomeScreen />
    </RequireSession>
  );
}
