import { JarsoMark } from "@/components/brand";

/**
 * What shows while a page decides where to send you (the role routers), instead of a grey box:
 * the mark, bobbing when motion is allowed, and one line in the app's voice (design.md §6).
 */
export function BrandSplash({ line = "Opening your jars…" }: { line?: string }) {
  return (
    <div
      role="status"
      className="rise-in flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center"
    >
      <JarsoMark size={72} className="motion-safe:animate-[coin-bob_1.6s_ease-in-out_infinite]" />
      <p className="font-semibold text-ink-2 text-lg">{line}</p>
    </div>
  );
}
