"use client";

import { RouteError } from "@/components/shell";

/** The root error boundary: stands alone, so it is the page's <main>. */
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError as="main" error={error} retry={retry} />;
}
