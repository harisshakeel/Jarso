import { cn } from "cn";
import { ChevronLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  intro?: string;
  /** Back link above the title; without one the eyebrow reads "Your family". */
  back?: { href: Route; label: string };
  /** Wide frame for the two-column child page; forms stay in the narrow column. */
  wide?: boolean;
  children: ReactNode;
};

/** Shared page frame for the child, allowance and gift screens. */
export function PageShell({ title, intro, back, wide = false, children }: PageShellProps) {
  return (
    <div className={cn("mx-auto grid w-full gap-6", wide ? "max-w-5xl" : "max-w-lg")}>
      <header className="grid gap-3">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-full pr-2 font-semibold text-primary text-sm hover:underline hover:underline-offset-4"
          >
            <ChevronLeftIcon aria-hidden className="size-5" />
            {back.label}
          </Link>
        ) : (
          <p className="eyebrow">Your family</p>
        )}
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
