"use client";

import { RouteError } from "@/components/shell";

/** Inside the app: the layout's navigation stays, so the child or parent can go elsewhere. */
export default function AppErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
