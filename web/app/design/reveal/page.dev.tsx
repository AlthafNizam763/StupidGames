'use client';


import { notFound, useSearchParams } from 'next/navigation';
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
 * The sample player is obviously sample data and never reaches a player:
 * `notFound()` in production. In the real game this component is handed
 * `GameSelfState.self.role`, which the server sends to one socket.
 *
 *   /design/reveal            the Operator
 *   /design/reveal?role=cat   the Cat
 */
/*
 * A fixed deadline, computed once when this module loads.
 *
 * Not during render: `Date.now()` in a render body is impure and the lint
 * rule that catches it is right to. Module scope runs once, so the preview
 * countdown simply starts from page load.
 */
const PREVIEW_STARTS_AT = Date.now() + 5_000;

export default function RoleRevealPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Preview />;
}

function Preview() {
  const params = useSearchParams();
  const role = params.get('role') === 'cat' ? PlayerRole.SABOTEUR : PlayerRole.OPERATOR;

  return (
    <RoleReveal
      role={role}
      username="Maya"
      avatarId="operator-03"
      appearance={coerceAppearance(deriveAppearance('preview-maya'))}
      startsAt={PREVIEW_STARTS_AT}
    />
  );
}
