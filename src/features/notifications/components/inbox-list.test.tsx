import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "../types";
import { InboxList } from "./inbox-list";

const push = vi.fn();
const refresh = vi.fn();
const mark = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push, refresh }),
}));
vi.mock("../server/actions", () => ({ markNoticesReadAction: mark }));

const notice: Notice = {
  id: "7b0f6a52-3c1e-4b52-9d52-0a6f3a1d1b11",
  kind: "allowance_due",
  childId: "c1",
  childName: "Sam",
  sourceType: "allowance_occurrence",
  sourceId: "s1",
  payload: { amount_minor: 500 },
  createdAt: new Date().toISOString(),
  read: false,
};

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  mark.mockReset();
});
afterEach(cleanup);

describe("InboxList", () => {
  it("shows the empty state", () => {
    render(<InboxList items={[]} currency="USD" viewer="child" />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("opens the record and saves it read", async () => {
    mark.mockResolvedValue({ ok: true, data: { changed: 1 } });
    render(<InboxList items={[notice]} currency="USD" viewer="child" />);
    fireEvent.click(screen.getByRole("link"));
    expect(push).toHaveBeenCalledWith("/child");
    expect(mark).toHaveBeenCalledWith(null, { ids: [notice.id] });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("still navigates when saving read fails (offline)", async () => {
    mark.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<InboxList items={[notice]} currency="USD" viewer="child" />);
    fireEvent.click(screen.getByRole("link"));
    expect(push).toHaveBeenCalledWith("/child");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("skips the refresh when the server says no, and still navigates", async () => {
    mark.mockResolvedValue({ ok: false, error: { code: "INTERNAL", message: "Nope" } });
    render(<InboxList items={[notice]} currency="USD" viewer="child" />);
    fireEvent.click(screen.getByRole("link"));
    expect(push).toHaveBeenCalledWith("/child");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a calm message when Mark all as read cannot reach the server", async () => {
    mark.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<InboxList items={[notice]} currency="USD" viewer="child" />);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]?.[0]).toMatch(/offline/i);
  });
});
