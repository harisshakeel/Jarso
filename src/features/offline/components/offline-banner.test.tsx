import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { offlineCopy } from "../copy";
import { OfflineBanner } from "./offline-banner";

afterEach(() => {
  cleanup();
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
});

describe("OfflineBanner", () => {
  it("shows the copy only when offline", () => {
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(offlineCopy.offline);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
