import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NeedsYou } from "./needs-you";

afterEach(cleanup);

describe("NeedsYou", () => {
  it("is all caught up only when nothing at all is waiting", () => {
    render(<NeedsYou items={[]} currency="GBP" otherCount={0} />);
    expect(screen.getByText("All caught up.")).toBeInTheDocument();
  });

  it("does not say all caught up while requests or notices wait", () => {
    render(<NeedsYou items={[]} currency="GBP" otherCount={2} />);
    expect(screen.queryByText("All caught up.")).toBeNull();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
