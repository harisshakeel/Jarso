import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandoverForm } from "./handover-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../server/actions", () => ({
  confirmHandoverAction: vi.fn(),
  markNotGivenAction: vi.fn(),
}));

afterEach(cleanup);

function renderForm(kind: "allowance" | "gift" = "allowance") {
  render(
    <HandoverForm
      kind={kind}
      id="occ-1"
      childId="child-1"
      nickname="Sam"
      currency="GBP"
      amountMinor={500}
      dueOn="2026-11-02"
      note={null}
      prefill={{ cash: 500, saved: 0 }}
    />,
  );
  return {
    spend: screen.getByLabelText("Spend (cash to Sam)") as HTMLInputElement,
    save: screen.getByLabelText("Save (you keep)") as HTMLInputElement,
  };
}

describe("HandoverForm", () => {
  it("fills Spend with the rest when only Save is typed", () => {
    const { spend, save } = renderForm();
    fireEvent.change(save, { target: { value: "2" } });
    expect(spend.value).toBe("3.00");
  });

  it("keeps a Spend amount the parent typed when they then type Save", () => {
    const { spend, save } = renderForm();
    fireEvent.change(spend, { target: { value: "3" } });
    fireEvent.change(save, { target: { value: "1" } });
    expect(spend.value).toBe("3");
    expect(screen.getByRole("status")).toHaveTextContent("will be noted as short");
  });

  it("shows no shortfall for a gift given in full or in part", () => {
    const { spend } = renderForm("gift");
    fireEvent.change(spend, { target: { value: "1" } });
    expect(screen.queryByText(/noted as short/)).not.toBeInTheDocument();
  });
});
