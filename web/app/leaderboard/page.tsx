import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { LeaderboardScreen } from '@/components/social/LeaderboardScreen';

export const metadata: Metadata = { title: 'Leaderboard' };

export default function LeaderboardPage() {
  return (
    <RequireSession>
      <LeaderboardScreen />
    </RequireSession>
  );
}
