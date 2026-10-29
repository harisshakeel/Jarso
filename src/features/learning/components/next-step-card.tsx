import { ArrowRightIcon, GraduationCapIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import type { NextStep } from "../types";

function describeStep(step: NextStep): { heading: string; body: string; href: Route; cta: string } {
  switch (step.kind) {
    case "resume":
      return {
        heading: "Halfway there. Keep going.",
        body: `Pick up "${step.title}" where you left off.`,
        href: routes.childMission(step.missionKey),
        cta: "Continue",
      };
    case "check-in":
      return {
        heading: "Five quick questions. Then your first mission.",
        body: "They help pick where you start. Nothing is locked.",
        href: routes.childCheckIn,
        cta: "Start",
      };
    case "practice":
      return {
        heading: "Practice time. About a minute.",
        body:
          step.count === 1
            ? "One skill is ready for a quick review."
            : `${step.count} skills are ready for a quick review.`,
        href: routes.childPractice,
        cta: "Practise",
      };
    case "mission":
      return {
        heading: `Day ${step.day}. ${step.title}`,
        body: "Two or three minutes. Hints are free.",
        href: routes.childMission(step.missionKey),
        cta: "Start mission",
      };
    case "done":
      return {
        heading: "Journey done. Nicely learned.",
        body: "Practice comes back when a skill is due, so it stays fresh.",
        href: routes.childLearn,
        cta: "See your skills",
      };
  }
}

/** The first thing on the child's Home (design.md §5, FR12): one clear next step. */
export function NextStepCard({ step }: { step: NextStep }) {
  const { heading, body, href, cta } = describeStep(step);
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-labelledby="next-step-heading" className="grid gap-3">
          <p className="eyebrow flex items-center gap-2">
            <GraduationCapIcon aria-hidden className="size-4" />
            Next step
          </p>
          <h2 id="next-step-heading" className="text-balance text-h3">
            {heading}
          </h2>
          <p className="text-ink-2">{body}</p>
          <Link
            href={href}
            className="keycap inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"
          >
            {cta}
            <ArrowRightIcon aria-hidden className="size-5" />
          </Link>
        </section>
      </CardContent>
    </Card>
  );
}
