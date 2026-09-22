import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `flat` for nested panels that should not compete with their parent. */
  elevation?: 'flat' | 'raised';
}

/** The standard surface: one border, one soft lift, generous radius. */
export function Card({ elevation = 'raised', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-void-700 bg-void-900',
        elevation === 'raised' && 'shadow-panel',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 p-5 pb-0 sm:p-6 sm:pb-0', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5 sm:p-6', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-void-700/70 p-5 sm:flex-row sm:justify-end sm:p-6',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
