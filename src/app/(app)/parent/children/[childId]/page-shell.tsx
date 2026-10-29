import type { ReactNode } from "react";

/** Shared page frame for the allowance and gift screens. */
export function PageShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <header className="grid gap-3">
        <p className="eyebrow">Your family</p>
        <h1 className="text-balance text-h1">{title}</h1>
        {intro ? <p className="text-ink-2">{intro}</p> : null}
      </header>
      {children}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="shimmer h-28 rounded-xl bg-muted" />
      <div className="shimmer h-24 rounded-xl bg-muted" />
      <div className="shimmer h-11 rounded-full bg-muted" />
    </div>
  );
}
