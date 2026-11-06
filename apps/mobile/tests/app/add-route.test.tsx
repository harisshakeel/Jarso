import { render, screen } from "@testing-library/react-native";
import { useRequests } from "@/features/requests";
import PlusTab from "../../app/(child)/(tabs)/plus";
import AddRoute from "../../app/(child)/add";

const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@/features/progress", () => ({ useParentLabel: () => "Mum" }));
jest.mock("@/features/requests", () => ({ useRequests: jest.fn() }));
jest.mock("@/features/flows", () => ({
  AddSheet: ({ waiting }: { waiting: number }) => {
    const { Text } = require("react-native");
    return <Text>{`waiting:${waiting}`}</Text>;
  },
}));

const ask = (id: string, status: string) => ({ id, status });

describe("add route", () => {
  it("counts pending asks only: an approved ask is already a yes", async () => {
    (useRequests as jest.Mock).mockReturnValue({
      data: [ask("1", "pending"), ask("2", "approved"), ask("3", "rejected"), ask("4", "pending")],
    });
    await render(<AddRoute />);
    expect(screen.getByText("waiting:2")).toBeOnTheScreen();
  });
});

describe("plus tab", () => {
  it("sends a deep link to the add sheet", async () => {
    await render(<PlusTab />);
    expect(mockRedirect).toHaveBeenCalledWith("/(child)/add");
  });
});
