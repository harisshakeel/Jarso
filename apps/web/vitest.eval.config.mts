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

// The guide's launch-gate evals (evals/guide). Separate from `pnpm test`: they call Claude, cost
// money and need ANTHROPIC_API_KEY, so they run only on request (`pnpm eval:guide`).
export default defineConfig({
  plugins: [markdownAsText],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["evals/**/*.eval.ts"],
    testTimeout: 30 * 60 * 1000,
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eval-placeholder",
    },
  },
});
