"use client";

import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { runOnline } from "@/features/offline";
import { type ActionState, idle } from "@/lib";
import { updateFamilySettingsAction } from "../server/actions";

/** IANA zones the browser knows; the server re-checks against Postgres before saving. */
function timezoneOptions(current: string): string[] {
  const zones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

/** Family-level settings a parent can change. Currency is fixed at creation and shown read-only. */
export function FamilySettingsForm({ timezone }: { timezone: string }) {
  const [chosen, setChosen] = useState(timezone);
  const zones = useMemo(() => timezoneOptions(timezone), [timezone]);
  const items = useMemo(() => Object.fromEntries(zones.map((zone) => [zone, zone])), [zones]);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await runOnline(() => updateFamilySettingsAction(prev, formData));
    if (result.ok) toast.success("Family settings saved");
    return result;
  }, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const timezoneErrors = fieldErrors?.timezone;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          name="timezone"
          items={items}
          value={chosen}
          onValueChange={(value) => {
            if (typeof value === "string") setChosen(value);
          }}
        >
          <SelectTrigger
            id="timezone"
            className="w-full"
            aria-invalid={timezoneErrors?.length ? true : undefined}
            aria-describedby={
              timezoneErrors?.length ? "timezone-help timezone-error" : "timezone-help"
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="timezone-help" className="text-muted-foreground text-sm">
          Allowance due dates and reminders follow this timezone.
        </p>
        <FieldError id="timezone-error" errors={timezoneErrors} />
      </div>
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" size="lg" loading={pending} disabled={chosen === timezone}>
        Save
      </Button>
    </form>
  );
}
