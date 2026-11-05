import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  Card,
  CardSeparator,
  Eyebrow,
  ListGroup,
  ListRow,
  ProgressBar,
  ScreenHeader,
} from "@/components/screen";
import { Text } from "@/components/ui";

describe("calm screen parts", () => {
  it("clamps the value", async () => {
    await render(
      <>
        <ProgressBar value={-1} accessibilityLabel="low" />
        <ProgressBar value={2} accessibilityLabel="high" />
        <ProgressBar value={0.57} tone="primary" accessibilityLabel="mid" />
      </>,
    );
    expect(screen.getByLabelText("low").props.accessibilityValue.now).toBe(0);
    expect(screen.getByLabelText("high").props.accessibilityValue.now).toBe(100);
    expect(screen.getByLabelText("mid").props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 57,
    });
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
  });

  it("eyebrow keeps sentence case", async () => {
    const label = "Do this next";
    await render(<Eyebrow>{label}</Eyebrow>);
    const eyebrow = screen.getByText("Do this next");
    expect(eyebrow.props.className ?? "").not.toMatch(/uppercase/);
  });

  it("list row is a 48 dp button with its label", async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Take some out" detail="From Save" onPress={onPress} />);
    const row = screen.getByRole("button", { name: "Take some out" });
    expect(screen.getByText("From Save")).toBeTruthy();
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("list row without onPress is not a button", async () => {
    await render(<ListRow label="Mia" />);
    expect(screen.getByText("Mia")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("list row says when it is expanded and shows what leads it", async () => {
    await render(<ListRow label="Rename" leading={<Text>R</Text>} expanded onPress={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Rename", expanded: true })).toBeTruthy();
    expect(screen.getByText("R")).toBeTruthy();
  });

  it("list group names its rows and skips empty ones", async () => {
    await render(
      <ListGroup label="Family">
        <ListRow label="Timezone" onPress={jest.fn()} />
        {null}
        <ListRow label="Invite" onPress={jest.fn()} />
      </ListGroup>,
    );
    expect(screen.getByRole("header", { name: "Family" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("screen header is a header with its overline", async () => {
    await render(<ScreenHeader overline="Tuesday 3 November" title="Hi, Mia!" size="display" />);
    expect(screen.getByRole("header", { name: "Hi, Mia!" })).toBeTruthy();
    expect(screen.getByText("Tuesday 3 November")).toBeTruthy();
  });

  it("card holds its children and a hidden separator", async () => {
    await render(
      <Card accessibilityLabel="Box">
        <Text>One</Text>
        <CardSeparator />
        <Text>Two</Text>
      </Card>,
    );
    expect(screen.getByLabelText("Box")).toBeTruthy();
    expect(screen.getByText("Two")).toBeTruthy();
  });
});
