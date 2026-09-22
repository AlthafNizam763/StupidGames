import { AVATAR_COLOURS, DEFAULT_AVATAR_ID, isAvatarId } from '@voidline/shared';
import { cn } from '@/lib/cn';

/**
 * An Operator suit portrait.
 *
 * Drawn as inline SVG rather than shipped as images: eight colour variants of
 * one silhouette would otherwise be eight network requests and eight files to
 * keep in sync, and this stays crisp from a 24px lobby row to a 96px profile
 * header. Original artwork, built for this project.
 *
 * The silhouette is a sealed pressure suit seen head-on - domed helmet, wide
 * visor, collar ring, shoulder yoke. The suit colour is the player's identity
 * and is the same value the Canvas renderer will use for their sprite (Phase
 * 9), so a player looks the same in the lobby as they do on the map.
 */
export interface AvatarProps {
  /** An avatar preset id. An unknown value falls back rather than rendering nothing. */
  avatarId: string;
  /** Rendered as an accessible label. Pass null for decorative use beside a name. */
  name?: string | null;
  className?: string;
}

export function Avatar({ avatarId, name, className }: AvatarProps) {
  const id = isAvatarId(avatarId) ? avatarId : DEFAULT_AVATAR_ID;
  const suit = AVATAR_COLOURS[id];

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('size-12 shrink-0', className)}
      role={name ? 'img' : undefined}
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
    >
      {/* Backing plate, so a light suit still reads against a light surface. */}
      <rect width="64" height="64" rx="16" className="fill-void-800" />
      <rect width="64" height="64" rx="16" className="fill-none stroke-void-600" strokeWidth="1" />

      {/* Shoulder yoke. Clipped by the plate's radius via the rounded corners. */}
      <path
        d="M11 64v-7c0-7.2 5.8-13 13-13h16c7.2 0 13 5.8 13 13v7Z"
        fill={suit}
        opacity="0.9"
      />
      {/* Collar ring, catching light from above. */}
      <rect x="23" y="40" width="18" height="7" rx="3.5" fill={suit} />
      <rect x="23" y="40" width="18" height="3" rx="1.5" fill="#FFFFFF" opacity="0.25" />

      {/* Helmet dome. */}
      <path d="M32 11c9.4 0 17 7.6 17 17v8c0 4.4-3.6 8-8 8H23c-4.4 0-8-3.6-8-8v-8c0-9.4 7.6-17 17-17Z" fill={suit} />
      {/* Visor: the void the player looks out of. */}
      <path
        d="M32 18c7.2 0 13 5.4 13 12v3c0 2.8-2.2 5-5 5H24c-2.8 0-5-2.2-5-5v-3c0-6.6 5.8-12 13-12Z"
        className="fill-void-950"
      />
      {/* Two highlight streaks. Enough to read as curved glass, no gradients. */}
      <path d="M25 24.5c2-2.2 4.8-3.5 7.8-3.5" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="39.5" cy="28" r="1.8" fill="#FFFFFF" opacity="0.25" />

      {/* Antenna, so the silhouette is not a plain dome. */}
      <path d="M46 16.5 50 12" stroke={suit} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50.5" cy="11.5" r="2" fill={suit} />
    </svg>
  );
}
