import { countryCodes } from "@jarso/core/config";
import { useState } from "react";
import { View } from "react-native";
import { Button, Input, Label, Text } from "@/components/ui";

const MAX_MATCHES = 6;

let countries: { code: string; name: string }[] | undefined;

/** English names, as on the web, sorted by name. Built on first use (after the Intl polyfills). */
function countryList() {
  if (!countries) {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    countries = countryCodes
      .map((code) => ({ code, name: names.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  return countries;
}

const nameOf = (code: string | null) =>
  code ? (countryList().find((country) => country.code === code)?.name ?? code) : "";

type CountryFieldProps = {
  label: string;
  placeholder: string;
  description: string;
  value: string | null;
  onChange(code: string | null): void;
  errors?: string[];
};

/**
 * The country, found by typing part of its name (the list is too long for a row of choices).
 * Typing clears the choice until a match is picked.
 */
export function CountryField({
  label,
  placeholder,
  description,
  value,
  onChange,
  errors,
}: CountryFieldProps) {
  const [query, setQuery] = useState(() => nameOf(value));
  const error = errors?.[0];
  const needle = query.trim().toLowerCase();
  const matches =
    needle && !value
      ? countryList()
          .filter((country) => country.name.toLowerCase().includes(needle))
          .slice(0, MAX_MATCHES)
      : [];

  return (
    <View className="gap-2">
      <Label nativeID={`${label}-label`}>{label}</Label>
      <Input
        accessibilityLabel={label}
        aria-labelledby={`${label}-label`}
        aria-invalid={Boolean(error)}
        className={error ? "border-destructive" : undefined}
        placeholder={placeholder}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          if (value) onChange(null);
        }}
        autoComplete="country"
        autoCorrect={false}
      />
      {matches.length ? (
        <View accessibilityRole="radiogroup" className="gap-2">
          {matches.map((country) => (
            <Button
              key={country.code}
              variant="outline"
              className="justify-start"
              role="radio"
              accessibilityLabel={country.name}
              accessibilityState={{ selected: false, checked: false }}
              onPress={() => {
                setQuery(country.name);
                onChange(country.code);
              }}
            >
              <Text>{country.name}</Text>
            </Button>
          ))}
        </View>
      ) : null}
      <Text className="text-muted-foreground">{description}</Text>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
