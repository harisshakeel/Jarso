import { Label } from "@/components/ui";
import { FieldError } from "./field";

function currencySymbol(currency: string): string {
  const part = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}

type AmountFieldProps = {
  currency: string;
  value: string;
  onValueChange: (value: string) => void;
  errors?: string[];
  /** Input id and name; change it when several amount fields share a page. */
  id?: string;
  label?: string;
  /** Id of text that describes this field (read after the label). */
  describedBy?: string;
};

/** Big amount input with the currency symbol at 60 % (spec §5.1). Parsed on the server. */
export function AmountField({
  currency,
  value,
  onValueChange,
  errors,
  id = "amount",
  label = "Amount",
  describedBy,
}: AmountFieldProps) {
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-baseline gap-2">
        <span aria-hidden className="money text-h1 text-ink-2">
          <span className="opacity-60">{currencySymbol(currency)}</span>
        </span>
        <input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          required
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={[errorId, describedBy].filter(Boolean).join(" ") || undefined}
          className="money h-14 w-full min-w-0 rounded-lg border border-input bg-muted px-3.5 font-extrabold text-3xl transition-colors focus-visible:border-ring aria-invalid:border-destructive"
        />
      </div>
      <FieldError id={errorId} errors={errors} />
    </div>
  );
}
