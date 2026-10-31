import Link from "next/link";
import { routes } from "@/config";
import { skills as allSkills, skillLevelLabels } from "../skills";
import type { SkillProgress } from "../types";

/**
 * What the child has learned, as counts that only go up (no day grid, no streaks). Learning
 * stays outside the jars: it is never tied to money (invariant 11).
 */
export function SkillsStrip({ skills }: { skills: SkillProgress[] }) {
  const started = skills
    .filter((s) => s.level > 0)
    .sort((a, b) => b.level - a.level)
    .map((s) => ({
      ...s,
      label: allSkills.find((k) => k.key === s.skillKey)?.label ?? s.skillKey,
    }));
  const learned = skills.filter((s) => s.level === 3).length;
  return (
    <section aria-labelledby="skills-heading" className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="skills-heading" className="eyebrow">
          What I've learned
        </h2>
        <Link
          href={routes.childLearn}
          className="inline-flex min-h-11 items-center font-semibold text-primary text-sm underline-offset-4 hover:underline"
        >
          See all
        </Link>
      </div>
      <p className="font-bold">
        {learned === 0
          ? "Your first skill is one mission away."
          : `${learned} ${learned === 1 ? "skill" : "skills"} learned`}
      </p>
      {started.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {started.map((s) => (
            <li
              key={s.skillKey}
              className={
                s.level === 3
                  ? "rounded-full bg-gold/30 px-3 py-1 font-semibold text-sm"
                  : "rounded-full bg-muted px-3 py-1 font-semibold text-sm"
              }
            >
              {s.label} · {skillLevelLabels[s.level]}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
