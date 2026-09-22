'use client';

import { AVATAR_IDS, AVATAR_LABELS, type CharacterAppearance } from '@voidline/shared';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  ACCESSORY_LABELS,
  BACKPACK_LABELS,
  BODY_LABELS,

  HAIR_LABELS,
  HAIR_PAINT,
  OUTFIT_PAINT,
  ROSTERS,
  SHOE_PAINT,
  SKIN_PAINT,
  uniformColour,
} from './appearance';
import { CharacterFigure, HumanCharacter } from './HumanCharacter';

/**
 * Character customisation (§AD).
 *
 * Entirely prop-driven: it is handed an appearance and reports a new one. It
 * does not read a store, does not call the API and does not know whether it
 * is being shown inside the profile screen or a preview harness. The screen
 * that mounts it owns persistence.
 *
 * LAYOUT. The preview is the point, so it is pinned and the controls scroll
 * under it. On a phone that means the character stays visible while a thumb
 * works through eight slots of swatches - a picker that scrolls the preview
 * off the top makes you change something, scroll up, look, and scroll back
 * down, which is the whole interaction done twice.
 *
 * SWATCHES, NOT DROPDOWNS. Every slot is a row of visible choices. A select
 * listing "hair-mohawk" is a worse control than eight little heads, and on a
 * phone a native select covers the preview with an OS sheet.
 */

type SlotKey = 'body' | 'skin' | 'hair' | 'hairColour' | 'outfit' | 'shoes' | 'accessory' | 'backpack';

const SLOT_LABELS: Record<SlotKey, string> = {
  body: 'Body',
  skin: 'Skin',
  hair: 'Hair',
  hairColour: 'Hair colour',
  outfit: 'Uniform',
  shoes: 'Shoes',
  accessory: 'Accessory',
  backpack: 'Pack',
};

export interface CharacterCustomiserProps {
  /** The appearance being edited. */
  value: CharacterAppearance;
  /** The player's avatar preset, which supplies the uniform colour. */
  avatarId: string;
  onChange: (next: CharacterAppearance) => void;
  onAvatarChange?: (avatarId: string) => void;
  /** Omitted, no save button is shown and changes are reported as they happen. */
  onSave?: () => void;
  saving?: boolean;
  /** True when the current value differs from what is stored. */
  dirty?: boolean;
  className?: string;
}

export function CharacterCustomiser({
  value,
  avatarId,
  onChange,
  onAvatarChange,
  onSave,
  saving = false,
  dirty = false,
  className,
}: CharacterCustomiserProps) {
  const set = <K extends keyof CharacterAppearance>(key: K, slot: CharacterAppearance[K]) =>
    onChange({ ...value, [key]: slot });

  return (
    <div className={cn('flex flex-col gap-5 lg:flex-row lg:items-start', className)}>
      {/* ------------------------------------------------------ preview - */}

      <div
        className="sticky top-2 z-10 flex shrink-0 flex-col items-center gap-3 rounded-2xl border
                   border-void-700 bg-void-850/95 p-4 backdrop-blur lg:top-6 lg:w-72"
      >
        <div
          className="relative grid w-full place-items-center rounded-xl bg-void-900 py-4"
          style={{
            // The plinth picks up the uniform colour, so changing avatar reads
            // as changing *you* rather than as changing a swatch.
            boxShadow: `inset 0 -40px 60px -50px ${uniformColour(avatarId)}`,
          }}
        >
          <HumanCharacter
            appearance={value}
            avatarId={avatarId}
            animated
            name="Your character"
            className="size-40 sm:size-48"
          />
        </div>

        {onSave ? (
          <Button fullWidth onClick={onSave} loading={saving} disabled={!dirty}>
            {dirty ? 'Save character' : 'Saved'}
          </Button>
        ) : null}
      </div>

      {/* ----------------------------------------------------- controls - */}

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Slot label={SLOT_LABELS.body}>
          {ROSTERS.body.map((body) => (
            <Chip
              key={body}
              selected={value.body === body}
              label={BODY_LABELS[body]}
              onClick={() => set('body', body)}
            >
              <HeadPreview appearance={{ ...value, body }} avatarId={avatarId} />
            </Chip>
          ))}
        </Slot>

        {onAvatarChange ? (
          <Slot
            label="Uniform colour"
            hint="How other players will refer to you out loud."
          >
            {AVATAR_IDS.map((id) => (
              <Chip
                key={id}
                selected={avatarId === id}
                label={AVATAR_LABELS[id]}
                onClick={() => onAvatarChange(id)}
              >
                <span
                  aria-hidden
                  className="block size-8 rounded-lg"
                  style={{ backgroundColor: uniformColour(id) }}
                />
              </Chip>
            ))}
          </Slot>
        ) : null}

        <Slot label={SLOT_LABELS.skin}>
          {ROSTERS.skin.map((skin) => (
            <Chip
              key={skin}
              selected={value.skin === skin}
              label={SKIN_PAINT[skin].label}
              onClick={() => set('skin', skin)}
            >
              <span
                aria-hidden
                className="block size-8 rounded-full"
                style={{ backgroundColor: SKIN_PAINT[skin].base }}
              />
            </Chip>
          ))}
        </Slot>

        <Slot label={SLOT_LABELS.hair}>
          {ROSTERS.hair.map((hair) => (
            <Chip
              key={hair}
              selected={value.hair === hair}
              label={HAIR_LABELS[hair]}
              onClick={() => set('hair', hair)}
            >
              <HeadPreview appearance={{ ...value, hair }} avatarId={avatarId} />
            </Chip>
          ))}
        </Slot>

        <Slot label={SLOT_LABELS.hairColour}>
          {ROSTERS.hairColour.map((hairColour) => (
            <Chip
              key={hairColour}
              selected={value.hairColour === hairColour}
              label={HAIR_PAINT[hairColour].label}
              onClick={() => set('hairColour', hairColour)}
            >
              <span
                aria-hidden
                className="block size-8 rounded-full"
                style={{ backgroundColor: HAIR_PAINT[hairColour].base }}
              />
            </Chip>
          ))}
        </Slot>

        <Slot label={SLOT_LABELS.outfit}>
          {ROSTERS.outfit.map((outfit) => (
            <Chip
              key={outfit}
              selected={value.outfit === outfit}
              label={OUTFIT_PAINT[outfit].label}
              onClick={() => set('outfit', outfit)}
            >
              <TorsoPreview appearance={{ ...value, outfit }} avatarId={avatarId} />
            </Chip>
          ))}
        </Slot>

        <Slot label={SLOT_LABELS.shoes}>
          {ROSTERS.shoes.map((shoes) => (
            <Chip
              key={shoes}
              selected={value.shoes === shoes}
              label={SHOE_PAINT[shoes].label}
              onClick={() => set('shoes', shoes)}
            >
              <span
                aria-hidden
                className="block h-4 w-8 rounded-md"
                style={{ backgroundColor: SHOE_PAINT[shoes].colour }}
              />
            </Chip>
          ))}
        </Slot>

        {/* Both optional slots lead with None, because none is a real choice. */}
        <Slot label={SLOT_LABELS.accessory}>
          <Chip
            selected={value.accessory === null}
            label="None"
            onClick={() => set('accessory', null)}
          >
            <NoneMark />
          </Chip>
          {ROSTERS.accessory.map((accessory) => (
            <Chip
              key={accessory}
              selected={value.accessory === accessory}
              label={ACCESSORY_LABELS[accessory]}
              onClick={() => set('accessory', accessory)}
            >
              <HeadPreview appearance={{ ...value, accessory }} avatarId={avatarId} />
            </Chip>
          ))}
        </Slot>

        <Slot label={SLOT_LABELS.backpack}>
          <Chip
            selected={value.backpack === null}
            label="None"
            onClick={() => set('backpack', null)}
          >
            <NoneMark />
          </Chip>
          {ROSTERS.backpack.map((backpack) => (
            <Chip
              key={backpack}
              selected={value.backpack === backpack}
              label={BACKPACK_LABELS[backpack]}
              onClick={() => set('backpack', backpack)}
            >
              <TorsoPreview appearance={{ ...value, backpack }} avatarId={avatarId} />
            </Chip>
          ))}
        </Slot>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- parts - */

function Slot({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-mono text-xs tracking-[0.2em] text-ink-faint uppercase">
        {label}
      </legend>
      {hint ? <p className="mb-2 -mt-1 text-xs text-ink-faint">{hint}</p> : null}
      {/*
       * A horizontal scroller on a phone and a wrapping grid above it.
       * Wrapping eight swatches at 320px produces a four-row block that
       * pushes every later slot off the screen; scrolling keeps each slot
       * one row tall and the whole list scannable.
       */}
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>
    </fieldset>
  );
}

function Chip({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className={cn(
        'flex shrink-0 touch-target flex-col items-center justify-center gap-1 rounded-xl border p-2',
        'transition-colors duration-150',
        selected
          ? 'border-signal bg-signal-glow'
          : 'border-void-700 bg-void-900 hover:border-void-500',
      )}
    >
      <span className="grid h-10 w-10 place-items-center overflow-hidden">{children}</span>
      {/*
       * The name is always present, never colour alone. "Teal" and "Lime" are
       * indistinguishable to some players, and this is a screen made entirely
       * of colour choices (§46).
       */}
      <span
        className={cn(
          'block w-14 truncate text-center text-[0.625rem]',
          selected ? 'text-signal' : 'text-ink-faint',
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** A cropped head, for slots that only change what is above the shoulders. */
function HeadPreview({
  appearance,
  avatarId,
}: {
  appearance: CharacterAppearance;
  avatarId: string;
}) {
  return (
    <svg viewBox="14 8 72 68" className="size-10" aria-hidden>
      <CharacterFigure appearance={appearance} avatarId={avatarId} />
    </svg>
  );
}

/** A cropped torso, for uniform and pack. */
function TorsoPreview({
  appearance,
  avatarId,
}: {
  appearance: CharacterAppearance;
  avatarId: string;
}) {
  return (
    <svg viewBox="18 66 64 52" className="size-10" aria-hidden>
      <CharacterFigure appearance={appearance} avatarId={avatarId} />
    </svg>
  );
}

function NoneMark() {
  return (
    <span
      aria-hidden
      className="grid size-8 place-items-center rounded-full border border-dashed border-void-500 text-ink-faint"
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
        <path d="M3 13 13 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}
