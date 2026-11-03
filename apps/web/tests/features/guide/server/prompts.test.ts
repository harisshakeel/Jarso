import { describe, expect, it } from "vitest";
import { GUIDE_SYSTEM_PROMPT, OUTPUT_SCREEN_PROMPT } from "@/features/guide/server/prompts";

describe("Jarso's prompts on actions", () => {
  it("say Jarso prepares actions for the user to confirm and never does or claims them", () => {
    expect(GUIDE_SYSTEM_PROMPT).toContain("propose_action");
    expect(GUIDE_SYSTEM_PROMPT).toMatch(
      /never move money, record anything.*yourself, and you never say you did/,
    );
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/only the user's tap does it/);
  });

  it("have the output screen hold back a reply that claims Jarso did something", () => {
    expect(OUTPUT_SCREEN_PROMPT).toContain("(problem: claims_action)");
  });
});
