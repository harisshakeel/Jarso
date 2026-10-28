import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * design.md §6: standalone actions are pills, 44 px tall by default (`default`, `lg`, `icon`)
 * so every child-facing control meets §11. `sm` / `icon-sm` (36 px) only inside parent tables. `keycap` / `keycap-gold` is the child's one
 * primary action per screen. Focus ring comes from the global `:focus-visible` rule.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border bg-clip-padding font-bold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate] select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-teal-800 dark:hover:bg-teal-300",
        keycap:
          "keycap border-transparent bg-primary text-primary-foreground hover:bg-teal-800 active:not-aria-[haspopup]:translate-y-0.5 dark:hover:bg-teal-300",
        "keycap-gold":
          "keycap keycap-gold border-transparent bg-gold text-gold-foreground hover:bg-gold-200 active:not-aria-[haspopup]:translate-y-0.5",
        outline:
          "border-hairline-strong bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-teal-200 aria-expanded:bg-secondary dark:hover:bg-teal-800",
        ghost: "border-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-transparent bg-destructive text-white hover:bg-destructive/90 dark:text-primary-foreground",
        link: "border-transparent text-primary underline underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "h-11 gap-2 px-5 text-base",
        sm: "h-9 gap-1.5 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-11 gap-2 px-6 text-base",
        icon: "size-11",
        "icon-sm": "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
