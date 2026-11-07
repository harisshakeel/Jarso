import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AllowanceForm } from "@/features/allowance/components/allowance-form";
import { createAllowanceAction } from "@/features/allowance/server/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/components/celebrate", () => ({ celebrate: vi.fn() }));
vi.mock("@/features/offline", () => ({ runOnline: (run: () => unknown) => run() }));
vi.mock("@/features/allowance/server/actions", () => ({
  createAllowanceAction: vi.fn(),
  changeAllowanceAction: vi.fn(),
}));

const CHILD = "6f1c2a52-3c4e-4c8e-9a51-0a1b2c3d4e5f";

beforeEach(() => {
  vi.mocked(createAllowanceAction).mockResolvedValue({ ok: true, data: "s-1" } as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderForm() {
  render(<AllowanceForm childId={CHILD} currency="GBP" today="2026-11-07" />);
  return {
    amount: screen.getByLabelText("Amount") as HTMLInputElement,
    save: screen.getByLabelText("To Save") as HTMLInputElement,
  };
}

async function sent(): Promise<FormData> {
  fireEvent.submit(screen.getByRole("button", { name: "Save allowance" }).closest("form") as never);
  await waitFor(() => expect(createAllowanceAction).toHaveBeenCalled());
  return vi.mocked(createAllowanceAction).mock.calls[0]?.[1] as FormData;
}

describe("AllowanceForm split", () => {
  it("starts a new allowance at 25% to Save and shows both parts", async () => {
    const { amount, save } = renderForm();
    fireEvent.change(amount, { target: { value: "20" } });
    expect((screen.getByLabelText("25% Save") as HTMLInputElement).checked).toBe(true);
    expect(save.value).toBe("5.00");
    expect(screen.getByText("£15 to Spend · £5 to Save")).toBeTruthy();
    expect((await sent()).get("save")).toBe("5.00");
  });

  it("All Spend sends 0", async () => {
    const { amount, save } = renderForm();
    fireEvent.change(amount, { target: { value: "20" } });
    fireEvent.click(screen.getByLabelText("All Spend"));
    expect(save.value).toBe("0.00");
  });

  it("a typed Save leaves the shares and is sent as typed", async () => {
    const { amount, save } = renderForm();
    fireEvent.change(amount, { target: { value: "20" } });
    fireEvent.change(save, { target: { value: "3.50" } });
    expect((screen.getByLabelText("25% Save") as HTMLInputElement).checked).toBe(false);
    fireEvent.change(amount, { target: { value: "30" } });
    expect(save.value).toBe("3.50");
    expect((await sent()).get("save")).toBe("3.50");
  });
});
