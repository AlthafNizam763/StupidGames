'use client';

import { PlayerRole } from '@voidline/shared';
import { ROLE_IDENTITY } from '@/lib/fiction';

import {
  DEFAULT_MAP_ID,
  DEFAULT_ROOM_SETTINGS,
  GameMode,
  MAP_LABELS,
  SETTINGS_BOUNDS,
  maxSaboteursFor,
  validateRoomSettings,
  type CreateRoomInput,
} from '@voidline/shared';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { FormError } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, SettingRow, SettingsGroup, Stepper, Toggle } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/constants/routes';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { roomsApi } from '@/services/rooms';

/**
 * The hostile faction, as the host reads it.
 *
 * Routed through the fiction layer rather than written here, so the room
 * settings and the role reveal cannot end up calling the same thing by two
 * different names. The wire field is still `saboteurCount`.
 */
const CATS = ROLE_IDENTITY[PlayerRole.SABOTEUR];

/**
 * Create room (§11).
 *
 * Runs `validateRoomSettings` from the shared package as the host adjusts the
 * controls, so an illegal combination is flagged immediately instead of on
 * submit. This is the reason that validator is shared - and it changes nothing
 * about trust: the server runs the same function on the raw body and would
 * reject the request regardless of what this screen decided.
 */
export function CreateRoomForm() {
  const router = useRouter();

  const [settings, setSettings] = useState<CreateRoomInput>({
    name: '',
    map: DEFAULT_MAP_ID,
    gameMode: DEFAULT_ROOM_SETTINGS.gameMode,
    maxPlayers: DEFAULT_ROOM_SETTINGS.maxPlayers,
    saboteurCount: DEFAULT_ROOM_SETTINGS.saboteurCount,
    objectiveCount: DEFAULT_ROOM_SETTINGS.objectiveCount,
    discussionTime: DEFAULT_ROOM_SETTINGS.discussionTime,
    votingTime: DEFAULT_ROOM_SETTINGS.votingTime,
    killCooldown: DEFAULT_ROOM_SETTINGS.killCooldown,
    emergencyMeetingLimit: DEFAULT_ROOM_SETTINGS.emergencyMeetingLimit,
    anonymousVoting: DEFAULT_ROOM_SETTINGS.anonymousVoting,
    confirmEjection: DEFAULT_ROOM_SETTINGS.confirmEjection,
    isPrivate: true,
  });

  /** Only surfaced once the host has typed a name, so the form does not open in an error state. */
  const [touched, setTouched] = useState(false);

  const validation = useMemo(() => validateRoomSettings(settings), [settings]);
  const liveErrors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const error of validation.errors) map[error.path] = error.message;
    return map;
  }, [validation]);

  const { pending, formError, fieldErrors, submit } = useFormSubmit(
    async (input: CreateRoomInput) => {
      const room = await roomsApi.create(input);
      router.replace(ROUTES.lobby(room.code));
    },
  );

  function patch(next: Partial<CreateRoomInput>) {
    setSettings((current) => {
      const merged = { ...current, ...next };

      /*
       * Lowering the player count can strand the saboteur count above parity.
       * Clamping it here means the host sees the number move rather than
       * hitting an error they did not cause - the rule is enforced either way,
       * but being told "3 is now illegal" is worse than watching it become 2.
       */
      const ceiling = maxSaboteursFor(merged.maxPlayers ?? DEFAULT_ROOM_SETTINGS.maxPlayers);
      if ((merged.saboteurCount ?? 1) > ceiling) merged.saboteurCount = ceiling;

      return merged;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!validation.valid) return;
    await submit(settings);
  }

  const saboteurCeiling = maxSaboteursFor(settings.maxPlayers ?? 8);

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <SettingsGroup title="Room">
        <div className="py-3.5">
          <Input
            label="Room name"
            value={settings.name}
            onChange={(e) => {
              setTouched(true);
              patch({ name: e.target.value });
            }}
            error={touched ? (fieldErrors.name ?? liveErrors.name) : null}
            hint="What players see on the join screen."
            maxLength={SETTINGS_BOUNDS.roomNameLength.max}
            disabled={pending}
          />
        </div>

        <SettingRow
          label="Map"
          description="More maps arrive after launch."
          control={
            <SegmentedControl
              legend="Map"
              value={settings.map ?? DEFAULT_MAP_ID}
              options={[{ value: DEFAULT_MAP_ID, label: MAP_LABELS[DEFAULT_MAP_ID] }]}
              onChange={(map) => patch({ map })}
            />
          }
        />

        <SettingRow
          label="Game mode"
          description="Rapid shortens every timer."
          control={
            <SegmentedControl
              legend="Game mode"
              value={settings.gameMode ?? GameMode.CLASSIC}
              options={[
                { value: GameMode.CLASSIC, label: 'Classic' },
                { value: GameMode.RAPID, label: 'Rapid' },
              ]}
              onChange={(gameMode) => {
                // Switching mode re-applies that mode's timer preset, which is
                // what picking a mode is for.
                const preset =
                  gameMode === GameMode.RAPID
                    ? { objectiveCount: 4, discussionTime: 20, votingTime: 20, killCooldown: 15 }
                    : {
                        objectiveCount: DEFAULT_ROOM_SETTINGS.objectiveCount,
                        discussionTime: DEFAULT_ROOM_SETTINGS.discussionTime,
                        votingTime: DEFAULT_ROOM_SETTINGS.votingTime,
                        killCooldown: DEFAULT_ROOM_SETTINGS.killCooldown,
                      };
                patch({ gameMode, ...preset });
              }}
            />
          }
        />

        <SettingRow
          label="Private room"
          description="Reachable by code only. Never listed."
          control={
            <Toggle
              id="room-private"
              label="Private room"
              checked={settings.isPrivate ?? true}
              onChange={(isPrivate) => patch({ isPrivate })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Crew">
        <SettingRow
          label="Max players"
          control={
            <Stepper
              id="max-players"
              label="Max players"
              value={settings.maxPlayers ?? 8}
              min={SETTINGS_BOUNDS.maxPlayers.min}
              max={SETTINGS_BOUNDS.maxPlayers.max}
              onChange={(maxPlayers) => patch({ maxPlayers })}
              disabled={pending}
            />
          }
        />

        <SettingRow
          label={CATS.plural}
          description={`At most ${saboteurCeiling} for ${settings.maxPlayers} players — they must start outnumbered.`}
          control={
            <Stepper
              id="saboteur-count"
              label={CATS.plural}
              value={settings.saboteurCount ?? 1}
              min={SETTINGS_BOUNDS.saboteurCount.min}
              max={saboteurCeiling}
              onChange={(saboteurCount) => patch({ saboteurCount })}
              disabled={pending}
            />
          }
        />

        <SettingRow
          label="Objectives each"
          description="Assigned to every Operator."
          control={
            <Stepper
              id="objective-count"
              label="Objectives each"
              value={settings.objectiveCount ?? 7}
              min={SETTINGS_BOUNDS.objectiveCount.min}
              max={SETTINGS_BOUNDS.objectiveCount.max}
              onChange={(objectiveCount) => patch({ objectiveCount })}
              disabled={pending}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Timing">
        <SettingRow
          label="Discussion"
          control={
            <Stepper
              id="discussion-time"
              label="Discussion time"
              value={settings.discussionTime ?? 45}
              min={SETTINGS_BOUNDS.discussionTime.min}
              max={SETTINGS_BOUNDS.discussionTime.max}
              step={5}
              suffix="s"
              onChange={(discussionTime) => patch({ discussionTime })}
              disabled={pending}
            />
          }
        />
        <SettingRow
          label="Voting"
          control={
            <Stepper
              id="voting-time"
              label="Voting time"
              value={settings.votingTime ?? 30}
              min={SETTINGS_BOUNDS.votingTime.min}
              max={SETTINGS_BOUNDS.votingTime.max}
              step={5}
              suffix="s"
              onChange={(votingTime) => patch({ votingTime })}
              disabled={pending}
            />
          }
        />
        <SettingRow
          label="Elimination cooldown"
          control={
            <Stepper
              id="kill-cooldown"
              label="Elimination cooldown"
              value={settings.killCooldown ?? 25}
              min={SETTINGS_BOUNDS.killCooldown.min}
              max={SETTINGS_BOUNDS.killCooldown.max}
              step={5}
              suffix="s"
              onChange={(killCooldown) => patch({ killCooldown })}
              disabled={pending}
            />
          }
        />
        <SettingRow
          label="Emergency meetings"
          description="Per player, per match. Zero disables them."
          control={
            <Stepper
              id="emergency-limit"
              label="Emergency meetings"
              value={settings.emergencyMeetingLimit ?? 1}
              min={SETTINGS_BOUNDS.emergencyMeetingLimit.min}
              max={SETTINGS_BOUNDS.emergencyMeetingLimit.max}
              onChange={(emergencyMeetingLimit) => patch({ emergencyMeetingLimit })}
              disabled={pending}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Council">
        <SettingRow
          label="Anonymous voting"
          description="Hide who voted for whom until the tally."
          control={
            <Toggle
              id="anonymous-voting"
              label="Anonymous voting"
              checked={settings.anonymousVoting ?? false}
              onChange={(anonymousVoting) => patch({ anonymousVoting })}
            />
          }
        />
        <SettingRow
          label="Confirm ejection"
          description={`Reveal whether the ejected player was ${CATS.name.toLowerCase()}.`}
          control={
            <Toggle
              id="confirm-ejection"
              label="Confirm ejection"
              checked={settings.confirmEjection ?? true}
              onChange={(confirmEjection) => patch({ confirmEjection })}
            />
          }
        />
      </SettingsGroup>

      <div className="pb-4">
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={pending}
          disabled={touched && !validation.valid}
        >
          Create room
        </Button>
        {touched && !validation.valid ? (
          <p role="alert" className="mt-2 text-center text-sm text-alert">
            {validation.errors[0]?.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
