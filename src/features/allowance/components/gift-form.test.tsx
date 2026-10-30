import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GiftForm } from "./gift-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../server/actions", () => ({
  cancelGiftAction: vi.fn(),
  createGiftAction: vi.fn(),
  updateGiftAction: vi.fn(),
}));

afterEach(cleanup);

const form = <GiftForm childId="child-1" nickname="Sam" currency="GBP" today="2026-10-30" />;

describe("GiftForm key", () => {
  it("renders no key on the server, so the first client render matches it", () => {
    const html = renderToString(form);
    expect(html).toMatch(/name="idempotencyKey" value=""/);
  });

  it("mints one key after mount and enables Save", () => {
    const { container } = render(form);
    const key = container.querySelector<HTMLInputElement>('input[name="idempotencyKey"]');
    expect(key?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(screen.getByRole("button", { name: "Save gift" })).toBeEnabled();
  });
});
