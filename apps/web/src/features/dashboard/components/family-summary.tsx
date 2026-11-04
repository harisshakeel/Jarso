import { dashboardCopy } from "@jarso/core/dashboard";
import { JarsoEyes } from "@/components/brand";

/**
 * Jarso's summary (spec answer 5; quieter since 2026-11-04): a few sentences about the
 * children's learning this week, written by AI from the app's own figures and checked in code
 * before it shows. A plain card with Jarso's face, a heading and an AI note under the text, so
 * it reads as a note beside the page, not a banner over it. The page says the same in full.
 */
export function FamilySummary({ text }: { text: string }) {
  return (
    <section
      aria-label={dashboardCopy.summaryLabel}
      className="grid gap-2 rounded-xl border border-hairline bg-card p-4 sm:p-5"
    >
      <h2 className="flex items-center gap-2 font-bold text-h3">
        <JarsoEyes size="sm" className="shrink-0" />
        {dashboardCopy.summaryTitle}
      </h2>
      <p className="max-w-[68ch] leading-relaxed">{text}</p>
      <p className="text-muted-foreground text-sm">{dashboardCopy.summaryNote}</p>
    </section>
  );
}

/** A placeholder while the summary is written, about the height of a three-line summary. */
export function FamilySummarySkeleton() {
  return <div aria-hidden className="shimmer h-28 rounded-xl bg-muted" />;
}
