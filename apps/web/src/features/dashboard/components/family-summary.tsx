import { JarsoEyes } from "@/components/brand";

/**
 * Jarso's summary (spec answer 5): a sentence or two written by AI from the dashboard's own
 * figures and checked in code before it shows, labelled as AI. The page above and below says
 * the same in full, so the summary is a shortcut, never the only place a fact lives.
 */
export function FamilySummary({ text }: { text: string }) {
  return (
    <section
      aria-label="Jarso's summary"
      className="flex items-start gap-3 rounded-xl bg-cyan-100 p-4 text-cyan-950 dark:bg-cyan-900/40 dark:text-cyan-50"
    >
      <JarsoEyes size="md" className="mt-0.5 shrink-0" />
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold text-cyan-700 text-xs dark:text-cyan-300">
          Jarso's summary · written by AI from the figures below
        </p>
        <p className="text-lg leading-snug">{text}</p>
      </div>
    </section>
  );
}

/** A placeholder while the summary is written, about the height of a two-line summary. */
export function FamilySummarySkeleton() {
  return <div aria-hidden className="shimmer h-20 rounded-xl bg-muted" />;
}
