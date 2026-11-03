import type { PhotoPriceResult } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoPriceButton } from "@/features/guide/components/photo-price-button";

const { readPriceFromPhotoAction } = vi.hoisted(() => ({ readPriceFromPhotoAction: vi.fn() }));

vi.mock("@/features/guide/server/actions", () => ({ readPriceFromPhotoAction }));
vi.mock("@/features/offline", () => ({
  runOnline: (action: () => Promise<unknown>) => action(),
}));

const copy = guideCopy.photo;
/** A full run is busy; reading a file and the action can take more than a second. */
const wait = { timeout: 5_000 };
const found: PhotoPriceResult = {
  found: true,
  priceMinor: 1299,
  price: "£12.99",
  label: "headphones",
  text: "Can I afford £12.99 for headphones?",
  allowances: null,
  proposal: {
    kind: "goal",
    title: "Headphones",
    emoji: "🎧",
    priceMinor: 1299,
    saveEachMinor: null,
    allowances: null,
    figures: "£12.99",
  },
};

/** jsdom has no canvas, so the button sends a photo that already fits as it is. */
function photo(type = "image/jpeg", bytes = 64) {
  return new File([new Uint8Array(bytes)], "price.jpg", { type });
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText(copy.button, { selector: "input" }), {
    target: { files: [file] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PhotoPriceButton", () => {
  it("opens the camera from one labelled button", () => {
    render(<PhotoPriceButton onResult={vi.fn()} />);
    const input = screen.getByLabelText(copy.button, { selector: "input" });
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("capture", "environment");
    expect(screen.getByRole("button", { name: copy.button })).toBeVisible();
  });

  it("sends the photo as a data URL and hands the price back as a question", async () => {
    readPriceFromPhotoAction.mockResolvedValue({ ok: true, data: found });
    const onResult = vi.fn();
    const onPendingChange = vi.fn();
    render(<PhotoPriceButton onResult={onResult} onPendingChange={onPendingChange} />);
    pick(photo());
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(found), wait);
    const [, payload] = readPriceFromPhotoAction.mock.calls[0] ?? [];
    expect(payload.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(onPendingChange).toHaveBeenNthCalledWith(1, true);
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("says so when the photo has no price", async () => {
    readPriceFromPhotoAction.mockResolvedValue({
      ok: true,
      data: { found: false, reason: "no_price" },
    });
    const onResult = vi.fn();
    render(<PhotoPriceButton onResult={onResult} />);
    pick(photo());
    expect(await screen.findByText(copy.none, {}, wait)).toBeVisible();
    expect(onResult).toHaveBeenCalledWith({ found: false, reason: "no_price" });
  });

  it("refuses a file that isn't a photo it can send, without calling the server", async () => {
    render(<PhotoPriceButton onResult={vi.fn()} />);
    pick(photo("application/pdf"));
    expect(await screen.findByText(copy.notPhoto, {}, wait)).toBeVisible();
    expect(readPriceFromPhotoAction).not.toHaveBeenCalled();
  });

  it("shows the server's message when the read fails", async () => {
    readPriceFromPhotoAction.mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMITED", message: guideCopy.rateLimitedMinute },
    });
    render(<PhotoPriceButton onResult={vi.fn()} />);
    pick(photo());
    expect(await screen.findByText(guideCopy.rateLimitedMinute, {}, wait)).toBeVisible();
  });
});
