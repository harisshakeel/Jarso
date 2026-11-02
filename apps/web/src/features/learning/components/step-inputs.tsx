"use client";

import { Slider } from "@/components/ui";
import { cn, formatMoney, minorDigits } from "@/lib";
import { type Draft, stableShuffle } from "../steps";
import { renderText } from "../text";
import type { StepBody } from "../types";

type InputProps<D extends Draft["kind"]> = {
  body: StepBody;
  draft: Extract<Draft, { kind: D }>;
  onChange: (draft: Draft) => void;
  currency: string;
  /** Locked once the step's outcome is showing. */
  disabled: boolean;
  /** Prefix for element ids, unique per step on the page. */
  idBase: string;
};

const optionCard =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-hairline-strong bg-card px-4 py-3 font-semibold transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-secondary has-disabled:cursor-default has-disabled:hover:bg-card";

/** Choice, predict and reason steps: one option from two to four. */
export function OptionInput({
  body,
  draft,
  onChange,
  currency,
  disabled,
  idBase,
}: InputProps<"option">) {
  if (body.type !== "choice" && body.type !== "predict" && body.type !== "reason") return null;
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="sr-only">Pick one answer</legend>
      {body.options.map((option) => (
        <label key={option.id} className={optionCard}>
          <input
            type="radio"
            name={`${idBase}-option`}
            value={option.id}
            checked={draft.optionId === option.id}
            onChange={() => onChange({ kind: "option", optionId: option.id })}
            className="size-5 shrink-0 accent-primary"
          />
          <span>{renderText(option.text, currency)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Amount steps: money in the family currency, or a whole count ("weeks"). */
export function NumberInput({
  body,
  draft,
  onChange,
  currency,
  disabled,
  idBase,
}: InputProps<"number">) {
  if (body.type !== "amount") return null;
  const money = body.unit === "money";
  const symbol = money
    ? (new Intl.NumberFormat("en-GB", { style: "currency", currency })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? "")
    : "";
  const placeholder = money ? (minorDigits(currency) > 0 ? "0.00" : "0") : "0";
  return (
    <div className="grid gap-2">
      <label htmlFor={`${idBase}-number`} className="font-semibold">
        Your answer
      </label>
      <div className="flex items-center gap-2">
        {symbol ? (
          <span aria-hidden className="font-bold text-ink-2 text-xl">
            {symbol}
          </span>
        ) : null}
        <input
          id={`${idBase}-number`}
          inputMode={money ? "decimal" : "numeric"}
          autoComplete="off"
          value={draft.text}
          onChange={(event) => onChange({ kind: "number", text: event.target.value })}
          disabled={disabled}
          placeholder={placeholder}
          className="h-12 w-40 rounded-xl border border-hairline-strong bg-card px-3 font-bold text-xl tabular-nums outline-none focus-visible:border-primary disabled:opacity-70"
          aria-describedby={body.suffix ? `${idBase}-suffix` : undefined}
        />
        {body.suffix ? (
          <span id={`${idBase}-suffix`} className="font-semibold text-ink-2">
            {body.suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Split steps: a slider for the Save part; Spend is the rest. */
export function SplitInput({
  body,
  draft,
  onChange,
  currency,
  disabled,
  idBase,
}: InputProps<"split">) {
  if (body.type !== "split") return null;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const spend = body.total - draft.save;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3" aria-live="polite">
        <div className="rounded-xl bg-teal-100 p-3 text-teal-800 dark:bg-teal-900 dark:text-teal-100">
          <p className="font-semibold text-sm">Spend</p>
          <p className="money font-extrabold text-2xl">{money(spend)}</p>
        </div>
        <div className="rounded-xl bg-gold-100 p-3 text-gold-700 dark:bg-gold-900 dark:text-gold">
          <p className="font-semibold text-sm">Save</p>
          <p className="money font-extrabold text-2xl">{money(draft.save)}</p>
        </div>
      </div>
      <div className="grid gap-2 px-1">
        <span id={`${idBase}-split-label`} className="font-semibold">
          Move the slider to choose how much goes to Save
        </span>
        <Slider
          aria-label="Save amount"
          aria-describedby={`${idBase}-split-label`}
          min={0}
          max={body.total}
          step={body.increment}
          value={[draft.save]}
          onValueChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            if (typeof next === "number") onChange({ kind: "split", save: next });
          }}
          disabled={disabled}
        />
        <div className="flex justify-between text-ink-2 text-sm">
          <span>All to Spend</span>
          <span>All to Save</span>
        </div>
      </div>
    </div>
  );
}

/** Sort steps: each item goes in one of two groups. */
export function SortInput({
  body,
  draft,
  onChange,
  currency,
  disabled,
  idBase,
}: InputProps<"sort">) {
  if (body.type !== "sort") return null;
  return (
    <ul className="grid gap-3">
      {body.items.map((item) => (
        <li key={item.id}>
          <fieldset
            disabled={disabled}
            className="grid gap-2 rounded-xl border border-hairline bg-card p-3 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <legend className="float-left font-semibold sm:mb-0">
              {renderText(item.text, currency)}
            </legend>
            <div className="clear-both flex gap-2 sm:clear-none">
              {body.buckets.map((bucket) => (
                <label
                  key={bucket.id}
                  className={cn(
                    "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-hairline-strong px-4 font-semibold text-sm transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground sm:flex-none has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2",
                  )}
                >
                  <input
                    type="radio"
                    name={`${idBase}-${item.id}`}
                    value={bucket.id}
                    checked={draft.placements[item.id] === bucket.id}
                    onChange={() =>
                      onChange({
                        kind: "sort",
                        placements: { ...draft.placements, [item.id]: bucket.id },
                      })
                    }
                    className="sr-only"
                  />
                  {bucket.label}
                </label>
              ))}
            </div>
          </fieldset>
        </li>
      ))}
    </ul>
  );
}

/** Match steps: pick the meaning for each word. */
export function MatchInput({
  body,
  draft,
  onChange,
  currency,
  disabled,
  idBase,
}: InputProps<"match">) {
  if (body.type !== "match") return null;
  const meanings = stableShuffle(body.pairs, idBase, (pair) => pair.id);
  return (
    <ul className="grid gap-3">
      {body.pairs.map((pair) => (
        <li key={pair.id} className="grid gap-2">
          <label htmlFor={`${idBase}-${pair.id}`} className="font-bold">
            {pair.term}
          </label>
          <select
            id={`${idBase}-${pair.id}`}
            value={draft.pairs[pair.id] ?? ""}
            onChange={(event) =>
              onChange({ kind: "match", pairs: { ...draft.pairs, [pair.id]: event.target.value } })
            }
            disabled={disabled}
            className="h-11 w-full rounded-xl border border-hairline-strong bg-card px-3 font-semibold outline-none focus-visible:border-primary disabled:opacity-70"
          >
            <option value="" disabled>
              Choose a meaning
            </option>
            {meanings.map((meaning) => (
              <option key={meaning.id} value={meaning.id}>
                {renderText(meaning.meaning, currency)}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}

/** The right input for a step's draft. */
export function StepInput(props: Omit<InputProps<Draft["kind"]>, "draft"> & { draft: Draft }) {
  const { draft } = props;
  switch (draft.kind) {
    case "option":
      return <OptionInput {...props} draft={draft} />;
    case "number":
      return <NumberInput {...props} draft={draft} />;
    case "split":
      return <SplitInput {...props} draft={draft} />;
    case "sort":
      return <SortInput {...props} draft={draft} />;
    case "match":
      return <MatchInput {...props} draft={draft} />;
  }
}
