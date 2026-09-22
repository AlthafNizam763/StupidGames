import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { PageHeader } from '@/components/layout/PageHeader';
import { JoinRoomForm } from '@/components/rooms/JoinRoomForm';

export const metadata: Metadata = { title: 'Join room' };

export default function JoinRoomPage() {
  return (
    <RequireSession>
      <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
        <PageHeader title="Join room" />
        <div className="mx-auto w-full max-w-md flex-1 py-6">
          <JoinRoomForm />
        </div>
      </main>
    </RequireSession>
  );
}
