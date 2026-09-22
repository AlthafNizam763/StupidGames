'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { HowToPlay } from '@/components/onboarding/HowToPlay';
import { useFirstVisit } from '@/hooks/useFirstVisit';
import { ONBOARDING_KEY } from '@/constants/storage';
import { ROUTES } from '@/constants/routes';

/**
 * How to play, as a page anybody can return to.
 *
 * Public: understanding the game should not require an account, and this is
 * the page a link from outside the game would point at.
 */
export default function HowToPlayPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { markSeen } = useFirstVisit(ONBOARDING_KEY);

  return (
    <HowToPlay
      initialSlide={Number(params.get('slide') ?? 0)}
      onDone={() => {
        // Reading it deliberately counts as having seen it, so it does not
        // then appear unbidden on the home screen afterwards.
        markSeen();
        router.push(ROUTES.home);
      }}
    />
  );
}
