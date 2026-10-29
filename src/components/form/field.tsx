import { CircleAlertIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Input, Label } from "@/components/ui";

type FieldProps = ComponentProps<typeof Input> & {
  name: string;
  label: string;
  /** Helper text below the input (design.md §6 Forms). */
  description?: ReactNode;
  errors?: string[];
};

/**
 * design.md §6 Forms: label above, 44 px input, helper text below, error in destructive with an
 * icon. `aria-invalid` and `aria-describedby` point at the helper and error text (§11).
 */
export function Field({ name, label, description, errors, ...props }: FieldProps) {
  const descriptionId = description ? `${name}-description` : undefined;
  const errorId = errors?.length ? `${name}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {description ? (
        <p id={descriptionId} className="text-muted-foreground text-sm">
          {description}
        </p>
      ) : null}
      <FieldError id={errorId} errors={errors} />
    </div>
  );
}

/** First error for a field, in destructive with an icon. Renders nothing without errors. */
export function FieldError({ id, errors }: { id?: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-destructive text-sm">
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {errors[0]}
    </p>
  );
}

/** Form-level error (not tied to one field), announced to screen readers. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-destructive text-sm">
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
