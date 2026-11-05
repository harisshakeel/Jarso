import { ChevronRightIcon, type LucideIcon } from "lucide-react-native";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";
import { Card, CardSeparator } from "./card";
import { Eyebrow } from "./eyebrow";

/**
 * One row of a list inside a `Card` (lists over stacked cards, spec §9): what leads it (an icon or
 * avatar), label, an optional muted detail line, and whatever trails it. With `onPress` it is a
 * 48 dp button with a chevron; `expanded` marks a row that opens something in place.
 */
export function ListRow({
  label,
  detail,
  leading,
  trailing,
  onPress,
  expanded,
  labelClassName,
  accessibilityRole = "button",
  accessibilityLabel,
}: {
  label: string;
  detail?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  expanded?: boolean;
  labelClassName?: string;
  accessibilityRole?: "button" | "link";
  accessibilityLabel?: string;
}) {
  const tokens = useTokens();
  const body = (
    <>
      {leading}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className={cn("font-sans-semibold", labelClassName)}>{label}</Text>
        {detail ? <Text className="text-small text-muted-foreground">{detail}</Text> : null}
      </View>
      {trailing}
      {onPress ? <ChevronRightIcon size={20} color={tokens["muted-foreground"]} /> : null}
    </>
  );
  if (!onPress) {
    return <View className="min-h-12 flex-row items-center gap-3">{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

/** A row's icon on its small secondary tile (settings menus). Decoration only. */
export function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  const tokens = useTokens();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-8 w-8 items-center justify-center rounded-lg bg-secondary"
    >
      <Icon size={18} color={tokens.primary} />
    </View>
  );
}

/** A name's initial in a muted circle. Decoration only: the name is always beside it. */
export function InitialAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(
        "items-center justify-center rounded-full bg-muted",
        large ? "h-14 w-14" : "h-8 w-8",
      )}
    >
      <Text className={cn("font-sans-extrabold", large && "text-h2")}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * A settings group:a small muted label, then its rows in one card with hairlines between them.
 * Empty children (`null`, `false`) are skipped, so no hairline is left hanging.
 */
export function ListGroup({ label, children }: { label?: string; children: ReactNode }) {
  // toArray keys each row and drops the empty ones.
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className="gap-1.5">
      {/* Sentence case, as every label on the phone (design.md §3, tests/type-scale.test.ts). */}
      {label ? (
        <Eyebrow header tone="muted" className="px-1">
          {label}
        </Eyebrow>
      ) : null}
      <Card className="gap-0 py-1">
        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 ? <CardSeparator /> : null}
            {row}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}
