import { profileCopy } from "@jarso/core/profiles";
import { describe, expect, it } from "vitest";

describe("profileCopy", () => {
  it("keeps every line", () => {
    expect(profileCopy).toMatchSnapshot();
  });
});
