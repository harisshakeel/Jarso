import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Pressable, View } from "react-native";
import { cn } from "@/lib/utils";
import { Label } from "./label";
import { Text } from "./text";

type DateFieldProps = {
  label: string;
  /** `YYYY-MM-DD`, or null before a day is chosen. */
  value: string | null;
  onChange(iso: string): void;
  minimumDate?: string;
  maximumDate?: string;
  /** A hint under the field. */
  description?: string;
  errors?: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");

/** The day as a local Date (the picker works in the phone's time zone). */
function toDate(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const display = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * A date picked in Android's dialog. ISO `YYYY-MM-DD` in and out, so it matches the web's
 * `<input type="date">` and core's schemas. The bounds only help: the schema re-checks.
 */
function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  description,
  errors,
}: DateFieldProps) {
  const error = errors?.[0];
  const shown = value ? display.format(toDate(value)) : "Choose a date";

  const open = () =>
    DateTimePickerAndroid.open({
      value: toDate(value ?? maximumDate ?? toIso(new Date())),
      mode: "date",
      minimumDate: minimumDate ? toDate(minimumDate) : undefined,
      maximumDate: maximumDate ? toDate(maximumDate) : undefined,
      onChange: (event, date) => {
        if (event.type === "set" && date) onChange(toIso(date));
      },
    });

  return (
    <View className="gap-2">
      <Label nativeID={`${label}-label`}>{label}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown }}
        accessibilityHint="Opens a calendar"
        onPress={open}
        className={cn(
          "h-12 w-full flex-row items-center rounded-md border border-input bg-background px-3 dark:bg-input/30",
          error && "border-destructive",
        )}
      >
        <Text className={value ? undefined : "text-muted-foreground"}>{shown}</Text>
      </Pressable>
      {description ? <Text className="text-muted-foreground">{description}</Text> : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export { DateField, type DateFieldProps };
