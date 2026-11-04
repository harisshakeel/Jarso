import { Platform, TextInput } from "react-native";
import { fontScaleCap } from "@/lib/font-scale";
import { cn } from "@/lib/utils";
import { useBodySizeClass } from "./text";

function Input({
  className,
  maxFontSizeMultiplier,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  const bodyClass = useBodySizeClass();
  return (
    <TextInput
      className={cn(
        bodyClass,
        // The web's field (design.md §6): surface-2 fill, input border, 14 dp corners, no shadow;
        // 48 dp tall on the phone for thumbs.
        "border-input bg-muted text-foreground flex h-12 w-full min-w-0 flex-row items-center rounded-lg border px-3.5 py-1 font-sans leading-5",
        props.editable === false &&
          cn(
            "opacity-50",
            Platform.select({ web: "disabled:pointer-events-none disabled:cursor-not-allowed" }),
          ),
        Platform.select({
          web: cn(
            "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow]",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          ),
          native: "placeholder:text-muted-foreground/50",
        }),
        className,
      )}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontScaleCap(className)}
      {...props}
    />
  );
}

export { Input };
