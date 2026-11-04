import { render, renderHook, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { BodySizeProvider, Input, Text, useBodySizeClass } from "@/components/ui";

describe("Text", () => {
  it("caps title and money tokens at 1.3", async () => {
    await render(<Text className="text-money-l">£4</Text>);
    expect(screen.getByText("£4").props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("leaves body uncapped", async () => {
    await render(<Text>Hi</Text>);
    expect(screen.getByText("Hi").props.maxFontSizeMultiplier).toBeUndefined();
  });

  it("explicit maxFontSizeMultiplier wins", async () => {
    await render(
      <Text className="text-h1" maxFontSizeMultiplier={2}>
        Title
      </Text>,
    );
    expect(screen.getByText("Title").props.maxFontSizeMultiplier).toBe(2);
  });

  it("sets tabular figures on money", async () => {
    await render(<Text className="text-money">£12</Text>);
    expect(StyleSheet.flatten(screen.getByText("£12").props.style).fontVariant).toEqual([
      "tabular-nums",
    ]);
  });

  it("body size defaults to child and follows the nearest provider", async () => {
    const plain = await renderHook(() => useBodySizeClass());
    expect(plain.result.current).toBe("text-body");

    const parent = ({ children }: { children: ReactNode }) => (
      <BodySizeProvider size="parent">{children}</BodySizeProvider>
    );
    const inParent = await renderHook(() => useBodySizeClass(), { wrapper: parent });
    expect(inParent.result.current).toBe("text-body-parent");

    const nested = ({ children }: { children: ReactNode }) => (
      <BodySizeProvider size="parent">
        <BodySizeProvider size="child">{children}</BodySizeProvider>
      </BodySizeProvider>
    );
    const inNested = await renderHook(() => useBodySizeClass(), { wrapper: nested });
    expect(inNested.result.current).toBe("text-body");
  });

  it("caps a money input", async () => {
    await render(<Input className="text-money-xl" accessibilityLabel="Amount" />);
    expect(screen.getByLabelText("Amount").props.maxFontSizeMultiplier).toBe(1.3);
  });
});
