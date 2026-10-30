"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { routes } from "@/config";
import { landingCopy } from "../copy";
import { useInView } from "../hooks/use-in-view";
import { GuideDemo } from "./demos/guide-demo";
import { TwoBeat } from "./two-beat";

/** Spec §3.3: the money guide, with its safety page one link away. */
export function GuideSection() {
  const stage = useRef<HTMLDivElement>(null);
  const play = useInView(stage, { threshold: 0.5 });
  const { guide } = landingCopy;

  return (
    <section
      aria-labelledby="guide-title"
      className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[5fr_6fr] lg:items-center lg:gap-16 lg:pl-[9.5rem]"
    >
      <div className="grid content-start gap-4">
        <h2
          id="guide-title"
          className="text-balance font-extrabold text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl"
        >
          <TwoBeat beats={guide.title} />
        </h2>
        <p className="text-ink-2 text-lg">{guide.note}</p>
        <Link
          href={routes.safety}
          className="inline-flex min-h-11 w-fit items-center gap-2 font-bold text-primary underline underline-offset-4 hover:decoration-2"
        >
          {guide.link}
          <ArrowRightIcon aria-hidden className="size-5" />
        </Link>
      </div>
      <div ref={stage} className="rounded-[2rem] bg-muted/70 p-4 sm:p-8">
        <GuideDemo play={play} />
      </div>
    </section>
  );
}
