'use client';

import { useCallback, useEffect, useState } from 'react';
import { FriendshipStatus, levelForXp, type Friendship } from '@voidline/shared';
import { CharacterBust } from '@/components/character';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState } from '@/components/ui';
import { socialApi } from '@/services/social';
import { toast } from '@/stores/uiStore';
import { cn } from '@/lib/cn';

/**
 * Friends (§AF).
 *
 * Friends and Requests come from one payload and are a filter over it, not
 * two requests. `incoming` tells apart a request waiting on you from one you
 * sent and are waiting on - the same status, and completely different things
 * to a person looking at the screen. Blocked is its own endpoint; see below.
 *
 * Every action refetches rather than patching the list locally. A friendship
 * has two sides and either can change it; a list edited optimistically here
 * would drift from the one the other person is looking at, and this screen is
 * not hot enough for the round trip to matter.
 */

/*
 * Blocked comes from its own endpoint, not from a filter.
 *
 * `GET /api/friends` deliberately omits blocks, and `GET /api/friends/blocked`
 * returns only the ones this player *placed* - listing blocks made against
 * them would tell them they had been blocked, which is the property the
 * request endpoint protects by answering the same 404 for a missing player, a
 * disabled account and a block. So the third tab is a second request rather
 * than a third slice of the first.
 */
type Tab = 'FRIENDS' | 'REQUESTS' | 'BLOCKED';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'FRIENDS', label: 'Friends' },
  { id: 'REQUESTS', label: 'Requests' },
  { id: 'BLOCKED', label: 'Blocked' },
];

export function FriendsScreen() {
  const [tab, setTab] = useState<Tab>('FRIENDS');
  const [all, setAll] = useState<Friendship[] | null>(null);
  const [blocked, setBlocked] = useState<Friendship[]>([]);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /*
   * Refetching is a counter, not a function call.
   *
   * The obvious shape - an async `load()` the effect and every action both
   * call - means the effect body calls something that sets state, which is an
   * extra render pass before the request has even left. Bumping a counter the
   * effect depends on gets the same refetch with nothing set synchronously,
   * and gives the retry button somewhere to point.
   */
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    // Both lists, together. They are two endpoints because the server keeps
    // blocks out of the main one, but they are one screen and refetching one
    // after an action that could affect either would leave the other stale.
    Promise.all([socialApi.friends(), socialApi.blocked()])
      .then(([friendships, blocks]) => {
        setAll(friendships);
        setBlocked(blocks);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [attempt]);

  /** Runs one action on one friendship, then refetches. */
  async function act(id: string, label: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      reload();
    } catch (error) {
      toast.danger(label, error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusyId(null);
    }
  }

  const accepted = all?.filter((f) => f.status === FriendshipStatus.ACCEPTED) ?? [];
  const pending = all?.filter((f) => f.status === FriendshipStatus.PENDING) ?? [];

  const shown = tab === 'FRIENDS' ? accepted : tab === 'REQUESTS' ? pending : blocked;

  return (
    <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
      <PageHeader title="Friends" />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 py-4">
        <AddFriend onAdded={reload} />

        <div role="tablist" aria-label="Friend lists" className="flex gap-1 rounded-xl bg-void-900 p-1">
          {TABS.map((entry) => {
            const count =
              entry.id === 'FRIENDS'
                ? accepted.length
                : entry.id === 'REQUESTS'
                  ? pending.length
                  : blocked.length;

            return (
              <button
                key={entry.id}
                role="tab"
                aria-selected={entry.id === tab}
                onClick={() => setTab(entry.id)}
                className={cn(
                  'touch-target flex-1 rounded-lg text-sm font-medium transition-colors',
                  entry.id === tab ? 'bg-void-700 text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {entry.label}
                {/*
                 * The count is only shown where it prompts an action. A "0"
                 * beside every tab is noise; a number beside Requests is the
                 * reason somebody opened this screen.
                 */}
                {entry.id === 'REQUESTS' && count > 0 ? (
                  <span className="ml-1.5 rounded-full bg-alert px-1.5 text-[0.625rem] font-bold text-void-950">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {failed ? (
          <ErrorState
            title="Could not load your friends"
            description="The station did not answer."
            onRetry={reload}
          />
        ) : all === null ? (
          <LoadingState label="Loading friends" />
        ) : shown.length === 0 ? (
          <EmptyState
            title={
              tab === 'FRIENDS'
                ? 'No friends yet'
                : tab === 'REQUESTS'
                  ? 'No pending requests'
                  : 'Nobody blocked'
            }
            description={
              tab === 'FRIENDS'
                ? 'Add a player by username above, or from the leaderboard.'
                : tab === 'REQUESTS'
                  ? 'Requests you send and receive both show up here.'
                  : 'Players you block cannot send you requests, and never learn that you did.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shown.map((friendship) => (
              <FriendRow
                key={friendship.id}
                friendship={friendship}
                busy={busyId === friendship.id}
                onAccept={() =>
                  void act(friendship.id, 'Could not accept', () =>
                    socialApi.acceptFriend(friendship.id),
                  )
                }
                onRemove={() =>
                  void act(friendship.id, 'Could not remove', () =>
                    socialApi.removeFriend(friendship.id),
                  )
                }
                onBlock={() =>
                  void act(friendship.id, 'Could not block', () =>
                    socialApi.blockPlayer(friendship.user.id),
                  )
                }
                /*
                 * Lifting a block is its own endpoint, not `remove`. The
                 * server keeps them apart because `remove` deletes any row a
                 * participant names - so a shared handler would let the
                 * blocked player clear their own block.
                 */
                onUnblock={() =>
                  void act(friendship.id, 'Could not unblock', () =>
                    socialApi.unblockPlayer(friendship.id),
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- add - */

/**
 * Send a request by username.
 *
 * `POST /api/friends/request` accepts either a user id or a username, so this
 * can take what a person actually knows about their friend. The client does
 * no lookup of its own on purpose: a username-to-id endpoint would be a tidy
 * way to enumerate which accounts exist, whereas on the request path an
 * unknown name, a disabled account and a block all answer the same 404.
 *
 * Which is also why the failure copy below says nothing more specific than
 * "check the username". Being more helpful here would mean being more helpful
 * to somebody probing for accounts, and would tell a blocked player they had
 * been blocked.
 */
function AddFriend({ onAdded }: { onAdded: () => void }) {
  const [username, setUsername] = useState('');
  const [pending, setPending] = useState(false);

  async function send() {
    const name = username.trim();
    if (!name || pending) return;

    setPending(true);
    try {
      await socialApi.requestFriend({ username: name });
      setUsername('');
      onAdded();
      toast.success(`Request sent to ${name}.`);
    } catch (error) {
      toast.danger(
        'Could not send that request',
        error instanceof Error ? error.message : 'Check the username and try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="flex items-end gap-2"
    >
      <Input
        label="Add a player"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        placeholder="Username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={16}
        className="flex-1"
        disabled={pending}
      />
      <Button type="submit" loading={pending} disabled={!username.trim()}>
        Add
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------- row - */

function FriendRow({
  friendship,
  busy,
  onAccept,
  onRemove,
  onBlock,
  onUnblock,
}: {
  friendship: Friendship;
  busy: boolean;
  onAccept: () => void;
  onRemove: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const { user, status, incoming } = friendship;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-void-700 bg-void-900 p-2.5">
      <CharacterBust
        userId={user.id}
        username={user.username}
        avatarId={user.avatar}
        appearance={user.appearance}
        className="size-11"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium text-ink">{user.username}</p>
        <p className="truncate text-xs text-ink-faint">Level {levelForXp(user.xp)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {status === FriendshipStatus.PENDING && incoming ? (
          <>
            <Button size="sm" onClick={onAccept} loading={busy}>
              Accept
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy}>
              Reject
            </Button>
          </>
        ) : status === FriendshipStatus.PENDING ? (
          <>
            <Badge tone="neutral">Sent</Badge>
            <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : status === FriendshipStatus.BLOCKED ? (
          <Button size="sm" variant="secondary" onClick={onUnblock} loading={busy}>
            Unblock
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onBlock} disabled={busy}>
              Block
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy}>
              Remove
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
