// `.md` imports are plain text: the `*.md` Turbopack rule in next.config.ts, and the
// markdown-as-text plugin in the Vitest configs.
declare module "*.md" {
  const text: string;
  export default text;
}
