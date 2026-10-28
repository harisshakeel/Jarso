"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <h2 className="font-semibold text-xl">Something went wrong</h2>
        <button type="button" onClick={retry} className="underline">
          Try again
        </button>
      </body>
    </html>
  );
}
