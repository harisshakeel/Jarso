"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Clears the bottom tab bar (64 px + safe area) with an 8 px gap (design.md §5, §6). */
const aboveTabBar = "calc(4rem + env(safe-area-inset-bottom) + 8px)";

/**
 * design.md §6 Toast: bottom, above the tab bar, 4 s. Brand-token colours instead of
 * Sonner's richColors; the type is carried by the icon, never by colour alone (§2.4).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      duration={4000}
      offset={{ bottom: aboveTabBar }}
      mobileOffset={{ bottom: aboveTabBar }}
      icons={{
        success: <CircleCheckIcon className="size-5 text-primary" />,
        info: <InfoIcon className="size-5 text-accent-text" />,
        warning: <TriangleAlertIcon className="size-5 text-gold-text" />,
        error: <OctagonXIcon className="size-5 text-destructive" />,
        loading: <Loader2Icon className="size-5 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--hairline)",
          "--border-radius": "calc(var(--radius) * 1.4)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans text-base shadow-raised",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
