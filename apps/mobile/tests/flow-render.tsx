import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { CelebrationProvider } from "@/components/celebrate";

/** Renders under a no-retry query client and the real celebration provider (child flows). */
export async function renderFlow(
  ui: ReactElement,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={client}>
      <CelebrationProvider>{node}</CelebrationProvider>
    </QueryClientProvider>
  );
  const result = await render(wrap(ui));
  return { ...result, client, rerender: (node: ReactElement) => result.rerender(wrap(node)) };
}
