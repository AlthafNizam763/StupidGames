import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { GameScreen } from '@/components/game/GameScreen';

export const metadata: Metadata = { title: 'Match' };

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <RequireSession>
      <GameScreen code={code.toUpperCase()} />
    </RequireSession>
  );
}
