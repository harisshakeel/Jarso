import { describeStep, NEXT_STEP_EYEBROW, type NextStep } from "@jarso/core/learning";
import { ArrowRightIcon, GraduationCapIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { CoachSays } from "@/components/brand";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";

/** Where each next step leads on the web. */
function hrefFor(step: NextStep): Route {
  switch (step.kind) {
    case "resume":
    case "mission":
      return routes.childMission(step.missionKey);
    case "check-in":
      return routes.childCheckIn;
    case "comeback":
      return routes.childWeekQuestion;
    case "practice":
      return routes.childPractice;
    case "done":
      return routes.childLearn;
  }
}

/**
 * The first thing on the child's Home (design.md §5, FR12): one clear next step, a coach beside
 * it. `bare` drops the card, for Home's learning card, which holds it beside the run and the road.
 */
export function NextStepCard({ step, bare = false }: { step: NextStep; bare?: boolean }) {
  const { title: heading, body, cta } = describeStep(step);
  const href = hrefFor(step);
  const section = (
    <section aria-labelledby="next-step-heading" className="grid content-center gap-3">
      <p className="eyebrow flex items-center gap-2">
        <GraduationCapIcon aria-hidden className="size-4" />
        {NEXT_STEP_EYEBROW}
      </p>
      <h2 id="next-step-heading" className="text-balance text-h3">
        {heading}
      </h2>
      <p className="text-ink-2">{body}</p>
      <CoachSays
        coach={{ key: `next-step-${step.kind}` }}
        says={{ moment: "nextStep" }}
        size="sm"
      />
      <Link
        href={href}
        className="keycap inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"
      >
        {cta}
        <ArrowRightIcon aria-hidden className="size-5" />
      </Link>
    </section>
  );
  if (bare) return section;
  return (
    <Card className="shadow-raised">
      <CardContent>{section}</CardContent>
    </Card>
  );
}
