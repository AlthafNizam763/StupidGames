'use client';

import {
  ErrorCode,
  MAP_LABELS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RoomSummary,
} from '@voidline/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar } from '@/components/brand/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import { ApiError } from '@/services/http';
import { roomsApi } from '@/services/rooms';

/**
 * Join room (§12).
 *
 * Two steps on purpose: look the room up, show what it is, then commit. A code
 * is six characters and easy to mistype, and dropping someone straight into a
 * stranger's lobby because they fat-fingered one character is worse than an
 * extra tap.
 *
 * Every failure state §12 lists gets its own message, driven by the server's
 * error code rather than by parsing text.
 */

const CODE_CHARS = new Set(ROOM_CODE_ALPHABET.split(''));

/** Copy for each way a join can fail. Keyed by the code the server sent. */
function describeFailure(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Could not reach the station. Check your connection and try again.';
  }

  switch (error.code) {
    case ErrorCode.ROOM_NOT_FOUND:
      return 'No room with that code. Check it and try again.';
    case ErrorCode.INVALID_ROOM_CODE:
      return 'That is not a valid room code.';
    case ErrorCode.ROOM_FULL:
      return 'That room is full.';
    case ErrorCode.ROOM_IN_PROGRESS:
      return 'That match has already started. Ask the host for the next one.';
    case ErrorCode.ROOM_CLOSED:
      return 'That room has been closed.';
    case ErrorCode.ALREADY_IN_ROOM:
      return error.message;
    default:
      return error.message;
  }
}

export function JoinRoomForm() {
  const router = useRouter();

  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const complete = code.length === ROOM_CODE_LENGTH;

  function handleCodeChange(raw: string) {
    /*
     * Uppercase and filter to the code alphabet as the player types. `0` and
     * `O` look identical on a phone screen, and the alphabet excludes one of
     * each lookalike pair - so silently dropping a character the code can never
     * contain is kinder than accepting it and reporting "not found".
     */
    const cleaned = raw
      .toUpperCase()
      .split('')
      .filter((char) => CODE_CHARS.has(char))
      .join('')
      .slice(0, ROOM_CODE_LENGTH);

    setCode(cleaned);
    setError(null);
    setRoom(null);
  }

  async function lookUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || pending) return;

    setPending(true);
    setError(null);

    try {
      setRoom(await roomsApi.join(code));
    } catch (caught) {
      setError(describeFailure(caught));
      setRoom(null);
    } finally {
      setPending(false);
    }
  }

  if (room) {
    return (
      <div className="flex flex-col gap-5 animate-rise">
        <div className="rounded-2xl border border-void-700 bg-void-850 p-4">
          <div className="flex items-start gap-3">
            <Avatar avatarId={room.host.avatar} className="size-11" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-bold text-ink">{room.name}</h2>
              <p className="truncate text-sm text-ink-muted">
                Hosted by {room.host.username}
              </p>
            </div>
            <Badge tone={room.isJoinable ? 'signal' : 'alert'}>
              {room.playerCount}/{room.maxPlayers}
            </Badge>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-void-700 bg-void-900 p-2.5">
              <dt className="text-xs text-ink-faint">Map</dt>
              <dd className="mt-0.5 text-ink">{MAP_LABELS[room.map]}</dd>
            </div>
            <div className="rounded-lg border border-void-700 bg-void-900 p-2.5">
              <dt className="text-xs text-ink-faint">Mode</dt>
              <dd className="mt-0.5 text-ink capitalize">{room.gameMode.toLowerCase()}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={() => router.replace(ROUTES.lobby(room.code))}>
            Enter lobby
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => {
              setRoom(null);
              setCode('');
            }}
          >
            Use a different code
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={lookUp} noValidate className="flex flex-col gap-5">
      <div>
        <label htmlFor="room-code" className="mb-2 block text-sm font-medium text-ink-muted">
          Room code
        </label>
        <input
          id="room-code"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          // A phone keyboard should open on letters, uncorrected and
          // uncapitalised - autocorrect on a six-character code is actively
          // harmful.
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          maxLength={ROOM_CODE_LENGTH}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'room-code-error' : 'room-code-hint'}
          placeholder="XXXXXX"
          disabled={pending}
          className={cn(
            'h-16 w-full rounded-xl border bg-void-850 text-center',
            'font-mono text-2xl tracking-[0.4em] text-ink uppercase',
            'placeholder:tracking-[0.4em] placeholder:text-void-600',
            error ? 'border-alert' : 'border-void-600 hover:border-void-500',
          )}
        />

        {error ? (
          <p id="room-code-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-alert">
            <span aria-hidden className="font-semibold">!</span>
            <span>{error}</span>
          </p>
        ) : (
          <p id="room-code-hint" className="mt-2 text-sm text-ink-faint">
            Six characters, from the host. Letters and numbers only.
          </p>
        )}
      </div>

      <Button type="submit" size="lg" fullWidth loading={pending} disabled={!complete}>
        Find room
      </Button>
    </form>
  );
}
