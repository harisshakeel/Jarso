import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";

/** Not found, on the empty-state recipe: mark, two beats, one pill (design.md §6). */
export default function NotFound() {
  return (
    <main className="rise-in flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <JarsoMark size={64} />
      <h2 className="text-balance text-h1">That page rolled away.</h2>
      <p className="text-ink-2 text-lg">Your jars are still where you left them.</p>
      <Link href={routes.dashboard} className={buttonVariants({ size: "lg" })}>
        Back to Jarso
      </Link>
    </main>
  );
}
