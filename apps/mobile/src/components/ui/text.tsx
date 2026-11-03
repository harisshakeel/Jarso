import { Slot } from "@rn-primitives/slot";
import * as React from "react";
import { Platform, Text as RNText, type TextStyle } from "react-native";
import { fontScaleCap, isMoneyClass } from "@/lib/font-scale";
import { cn } from "@/lib/utils";

type BodySize = "child" | "parent";

// Child reading text is 16; parent screens set 15 with a provider at their layout.
const BodySizeContext = React.createContext<BodySize>("child");

function BodySizeProvider({ size, children }: { size: BodySize; children: React.ReactNode }) {
  return <BodySizeContext.Provider value={size}>{children}</BodySizeContext.Provider>;
}

/** The body size class for the nearest `BodySizeProvider` (child body when there is none). */
function useBodySizeClass(): "text-body" | "text-body-parent" {
  return React.useContext(BodySizeContext) === "parent" ? "text-body-parent" : "text-body";
}

const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  maxFontSizeMultiplier,
  style,
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const bodyClass = useBodySizeClass();
  const Component = asChild ? Slot : RNText;
  const merged = cn(
    "font-sans text-foreground",
    bodyClass,
    Platform.select({ web: "select-text" }),
    textClass,
    className,
  );
  return (
    <Component
      className={merged}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontScaleCap(merged)}
      style={isMoneyClass(merged) ? [TABULAR, style] : style}
      {...props}
    />
  );
}

export { BodySizeProvider, Text, TextClassContext, useBodySizeClass };
