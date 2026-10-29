import { cn } from "cn";

type Option = { value: string; label: string };

type ChoiceChipsProps = {
  name: string;
  legend: string;
  options: readonly Option[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

/**
 * A radio group drawn as chips (design.md §6). Native radios, so arrow keys move the choice and
 * screen readers announce the group. The input is visually hidden; its chip shows the state.
 */
export function ChoiceChips({
  name,
  legend,
  options,
  value,
  onValueChange,
  className,
}: ChoiceChipsProps) {
  return (
    <fieldset className={cn("grid gap-2", className)}>
      <legend className="mb-2 font-semibold text-sm">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              className="peer sr-only"
            />
            <span className="inline-flex h-11 items-center rounded-full border border-hairline-strong px-4 font-bold text-sm transition-colors hover:bg-muted peer-checked:border-transparent peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
