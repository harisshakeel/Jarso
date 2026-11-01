"use client";

import { Nunito } from "next/font/google";
import "./globals.css";

// The root layout is gone when this renders, so the font and the body background come from here.
const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

/** Last-resort boundary: same words and shape as the route error page, without app components. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <h2 className="text-balance text-h1">That didn't load. Let's try again.</h2>
        <p className="text-ink-2 text-lg">Check your connection, then tap the button.</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex h-11 items-center rounded-full bg-primary px-6 font-bold text-primary-foreground"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
