import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { PageHeader } from '@/components/layout/PageHeader';
import { CreateRoomForm } from '@/components/rooms/CreateRoomForm';

export const metadata: Metadata = { title: 'Create room' };

export default function CreateRoomPage() {
  return (
    <RequireSession>
      <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
        <PageHeader title="Create room" />
        <div className="mx-auto w-full max-w-md flex-1 py-2">
          <CreateRoomForm />
        </div>
      </main>
    </RequireSession>
  );
}
