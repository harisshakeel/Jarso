import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markNoticesReadAction } from "../server/actions";
import type { Notice } from "../types";
import { UnreadNotices } from "./unread-notices";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../server/actions", () => ({ markNoticesReadAction: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const notice: Notice = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "limit_exceeded",
  childId: "c1",
  childName: "Maya",
  sourceType: "ledger_entry",
  sourceId: "e1",
  payload: { amount_minor: 1200, limit_minor: 1000 },
  createdAt: "2026-10-31T09:00:00Z",
  read: false,
};

describe("UnreadNotices", () => {
  it("lists each notice and renders nothing when there are none", () => {
    const { container, rerender } = render(<UnreadNotices items={[notice]} currency="GBP" />);
    expect(screen.getByText("Maya went over a spending limit")).toBeInTheDocument();
    rerender(<UnreadNotices items={[]} currency="GBP" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("saves the notice as read and opens the child's history", () => {
    vi.mocked(markNoticesReadAction).mockResolvedValue({ ok: true, data: { changed: 1 } });
    render(<UnreadNotices items={[notice]} currency="GBP" />);
    fireEvent.click(screen.getByRole("link", { name: /Maya went over a spending limit/ }));
    expect(markNoticesReadAction).toHaveBeenCalledWith(null, { ids: [notice.id] });
    expect(push).toHaveBeenCalledWith("/parent/children/c1/history");
  });
});
