import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { CelebrationProvider } from "@/components/celebrate";

/**
 * A no-retry client whose cache is never garbage-collected: the default 5-minute GC timer
 * would otherwise outlive the test and keep Jest from exiting.
 */
export function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

/** Renders under `testQueryClient()` and the real celebration provider (child flows). */
export async function renderFlow(ui: ReactElement, client = testQueryClient()) {
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={client}>
      <CelebrationProvider>{node}</CelebrationProvider>
    </QueryClientProvider>
  );
  const result = await render(wrap(ui));
  return { ...result, client, rerender: (node: ReactElement) => result.rerender(wrap(node)) };
}
