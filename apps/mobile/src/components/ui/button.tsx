import { cva, type VariantProps } from "class-variance-authority";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { TextClassContext } from "@/components/ui/text";
import { useTokens } from "@/lib";
import { cn } from "@/lib/utils";

/**
 * The web's Button on the phone (design.md §6): a pill, never a rounded rectangle. `keycap`,
 * `keycap-gold` and `keycap-success` are the child's one main action on a screen, with the
 * 3 dp ledge under it; pressed, the ledge goes and the face sinks into its place, so nothing
 * around the button moves. Heights stay phone-sized (48 / 56 dp) for thumbs.
 */
const KEYCAP =
  "border-b-[3px] active:border-b-0 active:translate-y-[3px] active:mb-[3px] shadow-none";

const buttonVariants = cva(
  cn(
    "group shrink-0 flex-row items-center justify-center gap-2 rounded-full shadow-none",
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    }),
  ),
  {
    variants: {
      variant: {
        default: cn(
          "bg-primary active:bg-primary/90",
          Platform.select({ web: "hover:bg-primary/90" }),
        ),
        keycap: cn(KEYCAP, "bg-primary border-keycap-ledge"),
        "keycap-gold": cn(KEYCAP, "bg-gold border-keycap-ledge-gold"),
        "keycap-success": cn(KEYCAP, "bg-success border-keycap-ledge-success"),
        destructive: cn(
          "bg-destructive active:bg-destructive/90 dark:bg-destructive/60",
          Platform.select({
            web: "hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
          }),
        ),
        outline: cn(
          "border border-hairline-strong bg-transparent active:bg-muted",
          Platform.select({ web: "hover:bg-muted" }),
        ),
        secondary: cn(
          "bg-secondary active:bg-secondary/80",
          Platform.select({ web: "hover:bg-secondary/80" }),
        ),
        ghost: cn("active:bg-muted", Platform.select({ web: "hover:bg-muted" })),
        link: "",
      },
      size: {
        default: cn("h-12 px-5 py-2", Platform.select({ web: "has-[>svg]:px-3" })),
        sm: cn("h-11 gap-1.5 px-4", Platform.select({ web: "has-[>svg]:px-2.5" })),
        lg: cn("h-14 px-6", Platform.select({ web: "has-[>svg]:px-4" })),
        icon: "h-11 w-11",
      },
    },
    // A pressed keycap loses its 3 dp ledge from its height and gets it back as margin.
    compoundVariants: [
      {
        variant: ["keycap", "keycap-gold", "keycap-success"],
        size: "default",
        class: "active:h-[45px]",
      },
      {
        variant: ["keycap", "keycap-gold", "keycap-success"],
        size: "sm",
        class: "active:h-[41px]",
      },
      {
        variant: ["keycap", "keycap-gold", "keycap-success"],
        size: "lg",
        class: "active:h-[53px]",
      },
      {
        variant: ["keycap", "keycap-gold", "keycap-success"],
        size: "icon",
        class: "active:h-[41px]",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva(
  cn(
    "font-sans-bold text-foreground",
    Platform.select({ web: "pointer-events-none transition-colors" }),
  ),
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        keycap: "text-primary-foreground",
        "keycap-gold": "text-gold-foreground",
        "keycap-success": "text-success-foreground",
        destructive: "text-white",
        outline: "",
        secondary: "text-secondary-foreground",
        ghost: "",
        link: cn(
          "text-primary group-active:underline",
          Platform.select({ web: "underline-offset-4 hover:underline group-hover:underline" }),
        ),
      },
      size: {
        default: "",
        sm: "",
        lg: "",
        icon: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

/** The spinner's colour on each fill: the label's own colour. */
const SPINNER: Record<
  ButtonVariant,
  "primary-foreground" | "gold-foreground" | "success-foreground" | "foreground"
> = {
  default: "primary-foreground",
  keycap: "primary-foreground",
  "keycap-gold": "gold-foreground",
  "keycap-success": "success-foreground",
  destructive: "primary-foreground",
  outline: "foreground",
  secondary: "foreground",
  ghost: "foreground",
  link: "foreground",
};

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    /**
     * Working: the label stays (unseen) so the button keeps its width, a spinner sits over it,
     * and the button is disabled and reads as busy.
     */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  accessibilityState,
  children,
  ...props
}: ButtonProps) {
  const tokens = useTokens();
  const off = Boolean(disabled) || loading;
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(off && "opacity-50", buttonVariants({ variant, size }), className)}
        role="button"
        disabled={off}
        accessibilityState={{
          ...accessibilityState,
          disabled: off || accessibilityState?.disabled,
          busy: loading || accessibilityState?.busy,
        }}
        {...props}
      >
        {loading ? (
          <>
            <View className="flex-row items-center gap-2 opacity-0">
              {children as React.ReactNode}
            </View>
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color={tokens[SPINNER[variant ?? "default"]]} />
            </View>
          </>
        ) : (
          children
        )}
      </Pressable>
    </TextClassContext.Provider>
  );
}

export type { ButtonProps };
export { Button, buttonTextVariants, buttonVariants };
