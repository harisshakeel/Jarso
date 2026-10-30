"use client";

import { useState, useSyncExternalStore } from "react";
import { FieldError, FormError } from "@/components/form";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { supportedCurrencies } from "@/config";
import { useOnlineActionState } from "@/features/offline";
import {
  type Currency,
  currencyForLocale,
  currencyLabels,
  DEFAULT_CURRENCY,
  isCurrency,
} from "../currency";
import { createFamilyAction } from "../server/actions";

// Browser-only values, read without an effect. The server snapshot is the fallback.
const subscribe = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const browserCurrency = () => currencyForLocale(navigator.language);

export function CreateFamilyForm({ next }: { next?: string }) {
  const [state, action, pending] = useOnlineActionState(createFamilyAction);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  const timezone = useSyncExternalStore(subscribe, browserTimezone, () => "");
  const detected = useSyncExternalStore(subscribe, browserCurrency, () => DEFAULT_CURRENCY);
  const [chosen, setChosen] = useState<Currency | null>(null);
  const currency = chosen ?? detected;

  const currencyErrors = fieldErrors?.currency;
  const timezoneErrors = fieldErrors?.timezone;

  return (
    <form action={action} className="grid gap-6" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <input type="hidden" name="timezone" value={timezone} />

      <div className="grid gap-2">
        <Label htmlFor="currency">Currency</Label>
        <Select
          name="currency"
          items={currencyLabels}
          value={currency}
          onValueChange={(value) => {
            if (isCurrency(value)) setChosen(value);
          }}
        >
          <SelectTrigger
            id="currency"
            className="w-full"
            aria-invalid={currencyErrors?.length ? true : undefined}
            aria-describedby={
              currencyErrors?.length ? "currency-help currency-error" : "currency-help"
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {supportedCurrencies.map((code) => (
              <SelectItem key={code} value={code}>
                {currencyLabels[code]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="currency-help" className="text-muted-foreground text-sm">
          Pocket money, savings and goals all use this currency.
        </p>
        <FieldError id="currency-error" errors={currencyErrors} />
      </div>

      <div className="grid gap-1">
        <p className="font-bold">Time zone</p>
        <p className="text-ink-2 text-sm">{timezone || "Finding your time zone…"}</p>
        <p className="text-muted-foreground text-sm">
          Taken from this device, so allowance days line up with your week.
        </p>
        <FieldError errors={timezoneErrors} />
      </div>

      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!timezone}>
        Create family
      </Button>
    </form>
  );
}
