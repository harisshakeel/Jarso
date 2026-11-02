import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceivedSheet } from "@/features/diary/components/received-sheet";

const { action, refresh } = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));
vi.mock("@/features/diary/server/actions", () => ({ recordMoneyReceivedAction: action }));

beforeEach(() => {
  vi.clearAllMocks();
  action.mockResolvedValue({ ok: true, data: {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openSheet() {
  render(<ReceivedSheet currency="GBP" />);
  fireEvent.click(screen.getByRole("button", { name: "Got money" }));
}

describe("ReceivedSheet", () => {
  it("opens from a Got money trigger with an unpicked source", () => {
    openSheet();
    expect(screen.getByText("Where did it come from?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Family" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Write it down" })).toBeDisabled();
  });

  it("starts on Spend and explains Save", () => {
    openSheet();
    expect(screen.getByRole("radio", { name: "Spend" })).toBeChecked();
    expect(screen.queryByText("Give the cash to your parent to keep.")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Save" }));
    expect(screen.getByText("Give the cash to your parent to keep.")).toBeInTheDocument();
  });

  it("sends the fields with one key and toasts on success", async () => {
    openSheet();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("radio", { name: "Birthday" }));
    fireEvent.click(screen.getByRole("radio", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("Name it (optional)"), {
      target: { value: "From Gran" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write it down" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [prev, input] = action.mock.calls[0] as [unknown, Record<string, string>];
    expect(prev).toBeNull();
    expect(input).toMatchObject({
      amount: "5",
      jar: "save",
      category: "birthday",
      label: "From Gran",
    });
    expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Saved. Nice one.",
        expect.objectContaining({ icon: expect.anything() }),
      ),
    );
  });

  it("sends nothing offline and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    openSheet();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("radio", { name: "Family" }));
    fireEvent.click(screen.getByRole("button", { name: "Write it down" }));
    const { offlineCopy } = await import("@jarso/core/offline");
    expect(await screen.findByText(offlineCopy.offline)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
