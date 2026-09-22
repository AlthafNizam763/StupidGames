import { notFound } from 'next/navigation';
import { PlayerRole, coerceAppearance, deriveAppearance } from '@voidline/shared';
import { RoleReveal } from '@/components/game/RoleReveal';

/**
 * Role reveal preview.
 *
 * Development only. The reveal is a timed sequence over a full-screen
 * overlay, which cannot be reviewed inside the gallery grid and cannot be
 * reviewed from source at all - the question "does the Cat landing feel like
 * anything" has exactly one way to be answered.
 *
 * The sample player here is obviously sample data and never reaches a
 * player: `notFound()` in production. In the real game this component is
 * handed `GameSelfState.self.role`, which the server sends to one socket.
 *
 *   /design/reveal            the Operator
 *   /design/reveal?role=cat   the Cat
 */
export default async function RoleRevealPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const role =
    (await searchParams).role === 'cat' ? PlayerRole.SABOTEUR : PlayerRole.OPERATOR;

  return (
    <RoleReveal
      role={role}
      username="Maya"
      avatarId="operator-03"
      appearance={coerceAppearance(deriveAppearance('preview-maya'))}
      secondsUntilStart={5}
    />
  );
}
