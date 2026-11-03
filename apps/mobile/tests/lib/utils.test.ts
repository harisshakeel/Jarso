import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a size token beside a colour", () => {
    expect(cn("font-sans-bold text-h3", "text-primary")).toBe(
      "font-sans-bold text-h3 text-primary",
    );
    expect(cn("text-body text-foreground", "text-muted-foreground")).toBe(
      "text-body text-muted-foreground",
    );
  });

  it("later size token wins", () => expect(cn("text-body", "text-money-l")).toBe("text-money-l"));

  it("body and body-parent conflict", () =>
    expect(cn("text-body-parent", "text-body")).toBe("text-body"));
});
