import { describe, expect, it } from "vitest";
import { scrub } from "./scrub";

describe("scrub", () => {
  it("removes emails, links and domains", () => {
    expect(scrub("email me at kid.name+x@example.com ok")).toBe("email me at [removed] ok");
    expect(scrub("look at https://shop.example/x?y=1 please")).toBe("look at [removed] please");
    expect(scrub("go to www.example.org now")).toBe("go to [removed] now");
    expect(scrub("my site is mysite.co.uk")).toBe("my site is [removed]");
  });

  it("removes phone numbers in common shapes", () => {
    expect(scrub("call 07700 900123")).toBe("call [removed]");
    expect(scrub("call +44 7700 900123")).toBe("call [removed]");
    expect(scrub("call (555) 123-4567")).toBe("call [removed]");
    expect(scrub("ring 555.123.4567 today")).toBe("ring [removed] today");
  });

  it("removes long digit runs like PINs, codes or card numbers", () => {
    expect(scrub("my card is 4111111111111111")).toBe("my card is [removed]");
    expect(scrub("code 123456")).toBe("code [removed]");
  });

  it("removes social handles and usernames", () => {
    expect(scrub("add me @sam_2014 ok")).toBe("add me [removed] ok");
    expect(scrub("my snap: kai.r and insta=@kai")).toBe("my [removed] and [removed]");
    expect(scrub("play with me on mygame.gg")).toBe("play with me on [removed]");
  });

  it("keeps maths and sums", () => {
    expect(scrub("if x = 12 and y = 3")).toBe("if x = 12 and y = 3");
  });

  it("keeps money and ordinary numbers", () => {
    expect(scrub("I have 12.50 and want a 30 pound game")).toBe(
      "I have 12.50 and want a 30 pound game",
    );
    expect(scrub("It costs £1,000 or $5.99")).toBe("It costs £1,000 or $5.99");
    expect(scrub("save 4 a week for 8 weeks")).toBe("save 4 a week for 8 weeks");
  });
});
