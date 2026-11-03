import { cn } from "cn";
import { ChevronLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const widths = {
  /** Forms, sheets turned into pages, one-task flows. */
  narrow: "max-w-2xl",
  /** Reading pages and single-column lists. */
  medium: "max-w-4xl",
  /** Dashboards and two-column pages. */
  default: "max-w-6xl",
  /** Home: three columns on wide screens so the whole page fits one screen. */
  wide: "max-w-[90rem]",
} as const;

export type PageWidth = keyof typeof widths;

/**
 * Centred page column (design.md §5). Every page sits in one, so lines never stretch across a
 * wide screen. Vertical rhythm between the header and sections is 32 px.
 */
export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: PageWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto grid w-full gap-8", widths[width], className)}>{children}</div>
  );
}

/** The one back link style: chevron, short label, 44 px target. */
export function BackLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-full px-2 font-semibold text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
    >
      <ChevronLeftIcon aria-hidden className="size-5" />
      {children}
    </Link>
  );
}

/**
 * Page header (design.md §5): optional back link and eyebrow, the page's one h1, one line of
 * description, and the page's primary action on the right from 768 px (under the text below).
 * `display` is for Home greetings only.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  back,
  action,
  size = "default",
  titleId,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  back?: ReactNode;
  action?: ReactNode;
  size?: "default" | "display";
  titleId?: string;
  className?: string;
}) {
  return (
    <header className={cn("grid gap-3", className)}>
      {back}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="grid max-w-2xl gap-2">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1
            id={titleId}
            className={cn(
              "text-balance",
              size === "display" ? "text-h1 md:text-display" : "text-h1",
            )}
          >
            {title}
          </h1>
          {description ? <div className="text-pretty text-ink-2">{description}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div> : null}
      </div>
    </header>
  );
}

/**
 * A titled block of a page. Pass `label` only when the block is a landmark worth naming
 * (it becomes a named region); otherwise the heading alone structures the page.
 */
export function PageSection({
  title,
  description,
  action,
  label,
  headingLevel = 2,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  label?: string;
  headingLevel?: 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-label={label} className={cn("grid content-start gap-4", className)}>
      {title || action ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="grid gap-1">
            {title ? (
              <Heading className={headingLevel === 2 ? "text-h2" : "text-h3"}>{title}</Heading>
            ) : null}
            {description ? <p className="text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
