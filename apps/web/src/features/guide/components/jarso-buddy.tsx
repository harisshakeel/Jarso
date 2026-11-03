"use client";

import { guideCopy } from "@jarso/core/guide";
import { SparkleIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { JarsoMark } from "@/components/brand";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui";
import { routes } from "@/config";
import { cn } from "@/lib";
import { GuideThread } from "./guide-thread";

/** What the buddy says when a page opens; one is picked after hydration so HTML matches. */
const HELLOS = ["Ask me!", "Money question?", "Hi! I'm Jarso", "Need a hand?"] as const;
/** How long the hello stays before it tucks away (hover or focus brings it back). */
const HELLO_MS = 6_000;

/**
 * Jarso, the AI helper, floating in the corner of every child page (FR07): the jar mark in a
 * grape bubble that bobs, twinkles and says hello for a moment. Tapping it opens a chat in a
 * side sheet, with a link to the full Jarso page. Hidden on the Jarso page itself. Grape is
 * Jarso's colour only (design.md §2.2), and motion stops under reduced motion.
 */
export function JarsoBuddy({ introNeeded }: { introNeeded: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hello, setHello] = useState<string | null>(null);

  useEffect(() => {
    setHello(HELLOS[Math.floor(Math.random() * HELLOS.length)] ?? HELLOS[0]);
    const tuck = setTimeout(() => setHello(null), HELLO_MS);
    return () => clearTimeout(tuck);
  }, []);

  if (pathname.startsWith(routes.childJarso)) return null;
  const { suggestions } = guideCopy;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "group/buddy fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 md:right-6 md:bottom-6",
          open && "hidden",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none relative rounded-2xl rounded-br-sm bg-card px-3 py-2 font-bold text-ai-text shadow-raised",
            "motion-safe:animate-[badge-in_400ms_var(--ease-brand)_both]",
            hello ? "block" : "hidden group-focus-within/buddy:block group-hover/buddy:block",
          )}
        >
          {hello ?? "Ask me!"}
        </span>
        <SheetTrigger
          aria-label="Ask Jarso, the AI helper"
          className={cn(
            "relative grid size-16 place-items-center rounded-full bg-ai shadow-raised ring-4 ring-tint-grape",
            "transition-transform duration-200 ease-brand hover:scale-110 hover:-rotate-6 active:scale-95",
            "motion-safe:animate-[buddy-bob_3.2s_ease-in-out_infinite]",
          )}
        >
          <span className="grid size-12 place-items-center rounded-full bg-card">
            <JarsoMark size={34} />
          </span>
          <SparkleIcon
            aria-hidden
            className="absolute -top-1 -left-1 size-5 fill-gold text-gold motion-safe:animate-[buddy-twinkle_2.4s_ease-in-out_infinite]"
          />
          <SparkleIcon
            aria-hidden
            className="absolute -right-1 bottom-0 size-4 fill-accent text-accent motion-safe:animate-[buddy-twinkle_2.4s_ease-in-out_1.2s_infinite]"
          />
        </SheetTrigger>
      </div>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md data-[side=right]:sm:max-w-md">
        <SheetTitle className="sr-only">{guideCopy.name}</SheetTitle>
        <SheetDescription className="sr-only">{guideCopy.disclosure}</SheetDescription>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-12 pb-4 sm:px-6">
          <GuideThread
            variant="page"
            introNeeded={introNeeded}
            openHref={routes.childJarso}
            suggestions={[suggestions.jars, suggestions.spent, suggestions.saving]}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
