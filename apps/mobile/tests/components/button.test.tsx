import { render, screen } from "@testing-library/react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

describe("Button keycaps", () => {
  it("keycap-grape has a grape ledge", async () => {
    await render(
      <Button variant="keycap-grape" accessibilityLabel="Go">
        <Text>Go</Text>
      </Button>,
    );
    const className = screen.getByLabelText("Go").props.className as string;
    expect(className).toContain("border-keycap-ledge-grape");
    expect(className).toContain("border-b-[5px]");
    expect(className).toContain("bg-grape-600");
  });

  it("keycap-white label uses keycap-white-foreground", async () => {
    await render(
      <Button variant="keycap-white" accessibilityLabel="Nope">
        <Text>Nope</Text>
      </Button>,
    );
    const label = screen.getByText("Nope");
    expect(label.props.className).toContain("text-keycap-white-foreground");
    expect(screen.getByLabelText("Nope").props.className).toContain("border-keycap-ledge-white");
  });

  it("xl keycap sinks to 67 when pressed", async () => {
    await render(
      <Button variant="keycap" size="xl" accessibilityLabel="Yes">
        <Text>Yes</Text>
      </Button>,
    );
    const className = screen.getByLabelText("Yes").props.className as string;
    expect(className).toContain("h-[72px]");
    expect(className).toContain("active:h-[67px]");
  });
});
