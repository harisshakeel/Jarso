import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChildRow } from "@/features/dashboard/components/child-row";

afterEach(cleanup);

describe("ChildRow", () => {
  it("links each child by their exact name, and offers Add a child", () => {
    render(
      <ChildRow
        items={[
          { id: "a", nickname: "Sam" },
          { id: "b", nickname: "Mia" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Sam" })).toHaveAttribute("href", "/parent/children/a");
    expect(screen.getByRole("link", { name: "Mia" })).toHaveAttribute("href", "/parent/children/b");
    expect(screen.getByRole("link", { name: "Add a child" })).toHaveAttribute(
      "href",
      "/parent/children/new",
    );
  });
});
