import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Imports `.md` files as their text, as the `*.md` Turbopack rule in next.config.ts does for the
 * app, so tests load Jarso's voice (`instructions.md`) exactly as Next does.
 */
const markdownAsText = {
  name: "markdown-as-text",
  transform(code: string, id: string) {
    if (!id.endsWith(".md")) return null;
    return { code: `export default ${JSON.stringify(code)};`, map: null };
  },
};

export default defineConfig({
  plugins: [react(), markdownAsText],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
  },
});
