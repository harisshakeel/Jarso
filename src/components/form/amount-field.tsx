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
};

/** Big amount input with the currency symbol at 60 % (spec §5.1). Parsed on the server. */
export function AmountField({ currency, value, onValueChange, errors }: AmountFieldProps) {
  const errorId = errors?.length ? "amount-error" : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor="amount">Amount</Label>
      <div className="flex items-baseline gap-2">
        <span aria-hidden className="money text-h1 text-ink-2">
          <span className="opacity-60">{currencySymbol(currency)}</span>
        </span>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          required
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          className="money h-14 w-full min-w-0 rounded-lg border border-input bg-muted px-3.5 font-extrabold text-3xl transition-colors focus-visible:border-ring aria-invalid:border-destructive"
        />
      </div>
      <FieldError id={errorId} errors={errors} />
    </div>
  );
}
