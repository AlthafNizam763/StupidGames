import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/*
 * Every size clears 44px in height (§6). A "small" button here is small in
 * padding and type, not in tap area - a 32px control is unusable with a thumb,
 * and this game is played with thumbs more often than with a mouse.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-11 px-3.5 text-sm gap-1.5',
  md: 'h-12 px-5 text-[0.9375rem] gap-2',
  lg: 'h-14 px-7 text-base gap-2.5',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-signal text-void-950 font-semibold hover:bg-signal/90 active:bg-signal-dim ' +
    'shadow-[0_0_0_1px_var(--color-signal-dim),0_8px_24px_-12px_var(--color-signal)]',
  secondary:
    'bg-void-800 text-ink border border-void-600 hover:bg-void-700 hover:border-void-500 active:bg-void-800',
  ghost: 'bg-transparent text-ink-muted hover:bg-void-800 hover:text-ink active:bg-void-850',
  danger:
    'bg-alert text-void-950 font-semibold hover:bg-alert/90 active:bg-alert-dim ' +
    'shadow-[0_0_0_1px_var(--color-alert-dim),0_8px_24px_-12px_var(--color-alert)]',
};

/**
 * The shared appearance, so a `<button>` and a navigation `<a>` that look like
 * the same control genuinely are the same control. Exported because the
 * alternative - copying class lists into link components - is how two variants
 * of "the primary button" end up drifting apart.
 */
export function buttonStyles(options: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  const { variant = 'primary', size = 'md', fullWidth = false, className } = options;
  return cn(
    'relative inline-flex touch-target select-none items-center justify-center rounded-xl',
    'font-medium transition-colors duration-150 ease-[var(--ease-out-soft)]',
    'disabled:pointer-events-none disabled:opacity-45',
    SIZES[size],
    VARIANTS[variant],
    /*
     * A button that is not full width does not shrink below its own label.
     *
     * The label carries `truncate`, which sets `overflow: hidden` and so lets
     * the button shrink past its content inside a flex row. Beside a
     * `fullWidth` sibling that means the short button collapses - "Skip"
     * became "S…" in the council and "Back" became "B…" in the onboarding,
     * twice, before this was fixed here rather than at each call site.
     *
     * `shrink-0` is deliberately NOT applied to a full-width button: `w-full`
     * plus no shrink in a flex row is an overflow waiting to happen, and
     * full-width buttons are the ones that legitimately need to give way.
     */
    fullWidth ? 'w-full' : 'shrink-0',
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables interaction and marks the control busy. */
  loading?: boolean;
  /** Stretches to the container. The default on mobile layouts. */
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? (
        <Spinner
          size={size === 'lg' ? 'md' : 'sm'}
          label={null}
          className={variant === 'primary' || variant === 'danger' ? 'text-void-950' : undefined}
        />
      ) : (
        leadingIcon
      )}
      {/*
       * The label stays mounted while loading so the button does not change
       * width mid-action, which would shift the layout under the user's finger.
       */}
      <span className={cn('truncate', loading && 'opacity-70')}>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** Navigation that looks like a button. Renders a real link, so it is keyboard- and middle-click-friendly. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonStyles({ variant, size, fullWidth, className })} {...props}>
      {leadingIcon}
      <span className="truncate">{children}</span>
      {trailingIcon}
    </Link>
  );
}
