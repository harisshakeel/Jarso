import { Text } from "@/components/ui";
import { cn } from "@/lib";

/** A section or step label (design.md §3): caption size, semibold, sentence case, never caps. */
export function Eyebrow({
  children,
  tone = "primary",
  className,
}: {
  children: string;
  tone?: "primary" | "muted";
  className?: string;
}) {
  return (
    <Text
      className={cn(
        "font-sans-semibold text-caption tracking-[1px]",
        tone === "primary" ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </Text>
  );
}
