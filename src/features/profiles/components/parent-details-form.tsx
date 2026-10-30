"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Field, FieldError, FormError } from "@/components/form";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { countryCodes, type Gender, genderLabels, genderOptions } from "@/config";
import { runOnline } from "@/features/offline";
import { type ActionState, idle } from "@/lib";
import { EARLIEST_BIRTH_DATE, latestAdultBirthDate } from "../age";
import { completeParentProfileAction } from "../server/actions";
import type { ParentDetails } from "../types";

type ParentDetailsFormProps = {
  /** Current details when editing from settings; empty for the first completion. */
  defaults?: Pick<ParentDetails, "dateOfBirth" | "country" | "gender"> | null;
  submitLabel: string;
  successMessage: string;
};

/** English names so the server and the browser render the same text (no hydration mismatch). */
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

const countries = countryCodes
  .map((code) => ({ code, name: regionNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

const countryItems = Object.fromEntries(countries.map(({ code, name }) => [code, name]));

/**
 * Date of birth, country and gender (ADR 0008). Used by the completion dialog and by settings.
 * The server re-validates everything; the date picker's `max` only helps. Every field is
 * controlled: React resets uncontrolled fields after a form action, which would wipe the date
 * when only another field was wrong.
 */
export function ParentDetailsForm({
  defaults,
  submitLabel,
  successMessage,
}: ParentDetailsFormProps) {
  const [dateOfBirth, setDateOfBirth] = useState(defaults?.dateOfBirth ?? "");
  const [country, setCountry] = useState<string | null>(defaults?.country ?? null);
  const [gender, setGender] = useState<string | null>(defaults?.gender ?? null);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await runOnline(() => completeParentProfileAction(prev, formData));
    if (result.ok) toast.success(successMessage);
    return result;
  }, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-5" noValidate>
      <Field
        name="dateOfBirth"
        label="Date of birth"
        type="date"
        min={EARLIEST_BIRTH_DATE}
        max={latestAdultBirthDate()}
        value={dateOfBirth}
        onChange={(event) => setDateOfBirth(event.target.value)}
        autoComplete="bday"
        required
        description="Parents need to be 18 or over."
        errors={fieldErrors?.dateOfBirth}
      />

      <div className="grid gap-2">
        <Label htmlFor="country">Country</Label>
        <Select
          name="country"
          items={countryItems}
          value={country}
          onValueChange={(value) => setCountry(typeof value === "string" ? value : null)}
        >
          <SelectTrigger
            id="country"
            className="w-full"
            aria-invalid={fieldErrors?.country?.length ? true : undefined}
            aria-describedby={fieldErrors?.country?.length ? "country-error" : undefined}
          >
            <SelectValue placeholder="Choose your country" />
          </SelectTrigger>
          <SelectContent>
            {countries.map(({ code, name }) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="country-error" errors={fieldErrors?.country} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="gender">Gender</Label>
        <Select
          name="gender"
          items={genderLabels}
          value={gender}
          onValueChange={(value) => setGender(typeof value === "string" ? value : null)}
        >
          <SelectTrigger
            id="gender"
            className="w-full"
            aria-invalid={fieldErrors?.gender?.length ? true : undefined}
            aria-describedby={fieldErrors?.gender?.length ? "gender-error" : undefined}
          >
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent>
            {genderOptions.map((option: Gender) => (
              <SelectItem key={option} value={option}>
                {genderLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="gender-error" errors={fieldErrors?.gender} />
      </div>

      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" size="lg" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
