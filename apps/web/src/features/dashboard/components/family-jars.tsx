"use client";

import { type ChildJars, familyBoardCopy, familyJars } from "@jarso/core/dashboard";
import { jarCapacity } from "@jarso/core/ledger";
import { useState } from "react";
import { JarIllustration } from "@/components/jar";
import { cn, formatMoney } from "@/lib";
import { SeriesDot } from "./series";

/**
 * Home's family jars (2026-11-04): the same Spend and Save jars a child sees, holding everyone's
 * money added up. The chips above pick one child instead; the choice stays on this card.
 */
export function FamilyJarsCard({ rows, currency }: { rows: ChildJars[]; currency: string }) {
  const [pick, setPick] = useState<string | null>(null);
  const readable = rows.filter((row) => row.jars !== null);
  const totals = familyJars(rows, pick);
  const picked = pick ? (rows.find((row) => row.childId === pick) ?? null) : null;
  const capacity = jarCapacity({
    spendMinor: totals.spend,
    saveMinor: totals.save,
    allowanceMinor: null,
    currency,
  });
  const who = picked?.nickname ?? (readable.length === 1 ? (readable[0]?.nickname ?? null) : null);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const options = [
    { id: null, label: familyBoardCopy.everyone, slot: null },
    ...readable.map((row) => ({ id: row.childId, label: row.nickname, slot: row.slot })),
  ];
  return (
    <section
      aria-labelledby="family-jars-title"
      className="grid content-start gap-4 rounded-xl bg-card p-5 shadow-rest"
    >
      <h2 id="family-jars-title" className="text-h2">
        {familyBoardCopy.jarsTitle}
      </h2>
      {readable.length === 0 ? (
        <p className="text-ink-2">{familyBoardCopy.jarsUnavailable}</p>
      ) : (
        <>
          {readable.length > 1 ? (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Show the jars for</legend>
              {options.map((option) => {
                const on = option.id === pick;
                return (
                  <button
                    key={option.id ?? "everyone"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPick(option.id)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 font-semibold text-sm transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-hairline bg-card hover:bg-muted",
                    )}
                  >
                    {option.slot !== null ? <SeriesDot slot={option.slot} /> : null}
                    {option.label}
                  </button>
                );
              })}
            </fieldset>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            {(["spend", "save"] as const).map((jar) => (
              <div key={jar} className="grid justify-items-center gap-1.5 text-center">
                <JarIllustration
                  jar={jar}
                  size="sm"
                  capacityMinor={capacity}
                  filledMinor={totals[jar]}
                />
                <h3 className="font-semibold text-ink-2">{jar === "spend" ? "Spend" : "Save"}</h3>
                <p className="money font-extrabold text-money-l">{money(totals[jar])}</p>
              </div>
            ))}
          </div>
          <p aria-live="polite" className="text-center text-ink-2 text-sm">
            {familyBoardCopy.jarsWho(who)}
          </p>
        </>
      )}
    </section>
  );
}
