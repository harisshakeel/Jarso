import { LID_COLORS, lookCopy } from "@jarso/core/mascot";
import { render, screen, userEvent } from "@testing-library/react-native";
import { LookPicker } from "@/features/progress";

const LOOK = { lid: "cyan", wear: "none" } as const;

describe("LookPicker", () => {
  it("shows one swatch per lid colour, the chosen one selected", async () => {
    await render(<LookPicker level={1} value={LOOK} onChange={jest.fn()} />);
    for (const lid of LID_COLORS) {
      expect(
        screen.getByRole("radio", { name: lookCopy.lidLabel(lookCopy.lid[lid]) }),
      ).toBeTruthy();
    }
    expect(
      screen.getByRole("radio", { name: lookCopy.lidLabel(lookCopy.lid.cyan) }).props
        .accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it("tapping a lid changes only the lid", async () => {
    const onChange = jest.fn();
    await render(<LookPicker level={1} value={LOOK} onChange={onChange} />);
    await userEvent.press(
      screen.getByRole("radio", { name: lookCopy.lidLabel(lookCopy.lid.grape) }),
    );
    expect(onChange).toHaveBeenCalledWith({ lid: "grape", wear: "none" });
  });

  it("tapping unlocked wear changes only the wear", async () => {
    const onChange = jest.fn();
    await render(<LookPicker level={3} value={LOOK} onChange={onChange} />);
    await userEvent.press(screen.getByRole("radio", { name: lookCopy.wear.shades }));
    expect(onChange).toHaveBeenCalledWith({ lid: "cyan", wear: "shades" });
  });

  it("locked wear shows its unlock level and cannot be picked", async () => {
    const onChange = jest.fn();
    await render(<LookPicker level={1} value={LOOK} onChange={onChange} />);
    const crown = screen.getByRole("radio", { name: lookCopy.lockedLabel(lookCopy.wear.crown, 5) });
    expect(crown.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(lookCopy.unlocksAt(5))).toBeTruthy();
    await userEvent.press(crown);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("previews Jarso in the chosen look", async () => {
    await render(
      <LookPicker level={5} value={{ lid: "grape", wear: "crown" }} onChange={jest.fn()} />,
    );
    expect(screen.getByRole("image", { name: lookCopy.preview })).toBeTruthy();
    expect(screen.getByTestId("jarso-wear-crown", { includeHiddenElements: true })).toBeTruthy();
  });
});
