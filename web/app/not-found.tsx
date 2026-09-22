import { ButtonLink } from '@/components/ui/Button';
import { LogoMark } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';

export default function NotFound() {
  return (
    <main
      id="main"
      className="min-h-screen-safe flex flex-col items-center justify-center gap-6 px-safe text-center"
    >
      <LogoMark className="size-12 text-void-500" />

      <div className="max-w-md">
        <p className="font-mono text-sm tracking-[0.3em] text-ink-faint">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">No such sector</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          This part of the station does not exist. It may have been decommissioned, or the link
          may be wrong.
        </p>
      </div>

      <ButtonLink href={ROUTES.splash} size="md" className="w-full max-w-xs">
        Back to start
      </ButtonLink>
    </main>
  );
}
