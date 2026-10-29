import { describe, expect, it } from "vitest";
import { parentDetailsSchema } from "./schemas";

const valid = { dateOfBirth: "1985-06-15", country: "PK", gender: "female" };

describe("parentDetailsSchema", () => {
  it("accepts an adult with a known country and gender", () => {
    expect(parentDetailsSchema.parse(valid)).toEqual(valid);
  });

  it("refuses anyone under 18", () => {
    const result = parentDetailsSchema.safeParse({ ...valid, dateOfBirth: "2015-01-01" });
    expect(result.success).toBe(false);
  });

  it.each(["", "15/06/1985", "1985-13-01"])("refuses the date %s", (dateOfBirth) => {
    expect(parentDetailsSchema.safeParse({ ...valid, dateOfBirth }).success).toBe(false);
  });

  it.each(["", "pk", "XX", "PAK"])("refuses the country %s", (country) => {
    expect(parentDetailsSchema.safeParse({ ...valid, country }).success).toBe(false);
  });

  it("accepts every gender option and nothing else", () => {
    for (const gender of ["female", "male", "non_binary", "prefer_not_to_say"]) {
      expect(parentDetailsSchema.safeParse({ ...valid, gender }).success).toBe(true);
    }
    expect(parentDetailsSchema.safeParse({ ...valid, gender: "other" }).success).toBe(false);
  });
});
