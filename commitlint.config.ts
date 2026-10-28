import type { UserConfig } from "@commitlint/types";

// Conventional Commits. Keep in sync with .github/workflows/semantic-pr.yml `types`.
const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "body-max-line-length": [1, "always", 100],
  },
};

export default config;
