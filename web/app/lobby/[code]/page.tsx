import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { LobbyScreen } from '@/components/lobby/LobbyScreen';

export const metadata: Metadata = { title: 'Lobby' };

/**
 * Route params are a promise in Next 16, so the page awaits them and hands the
 * plain value to the client component below.
 */
export default async function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <RequireSession>
      <LobbyScreen code={code.toUpperCase()} />
    </RequireSession>
  );
}
