import type { Metadata } from 'next';
import { RequireSession } from '@/components/auth/SessionGuards';
import { SettingsScreen } from '@/components/settings/SettingsScreen';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Settings sits behind a session for consistency with the rest of the
 * signed-in area, even though the values are stored locally.
 */
export default function SettingsPage() {
  return (
    <RequireSession>
      <SettingsScreen />
    </RequireSession>
  );
}
