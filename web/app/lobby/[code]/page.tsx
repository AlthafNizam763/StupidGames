import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { LobbyPreview } from '@/components/lobby/LobbyPreview';

export const metadata: Metadata = { title: 'Lobby' };

/**
 * Route params are a promise in Next 16, so the page awaits them and hands the
 * plain value to the client component below.
 */
export default async function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <RequireSession>
      <LobbyPreview code={code.toUpperCase()} />
    </RequireSession>
  );
}
