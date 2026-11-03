import { addChildCopy, nicknameTaken } from "@jarso/core/family";
import { jarsoNoticeCopy } from "@jarso/core/guide";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import { AppError } from "@/lib";
import { apiFetch } from "@/lib/api";
import { flash } from "@/lib/flash";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));

const CHILD = "22222222-2222-4222-8222-222222222222";
const api = apiFetch as jest.Mock;

function Root() {
  const [client] = require("react").useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}

function HubStub() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return <Text>{`Hub ${childId}`}</Text>;
}

function renderApp() {
  return renderRouter(
    {
      _layout: Root,
      "(parent)/(tabs)/index": () => <Text>Family home</Text>,
      "(parent)/children/new": require("../../../app/(parent)/children/new"),
      "(parent)/children/[childId]/index": HubStub,
    },
    { initialUrl: "/children/new" },
  );
}

/** The guide state says Jarso runs here; the add answers with `child` or throws `error`. */
function answer({ child, error }: { child?: { id: string; nickname: string }; error?: Error }) {
  api.mockImplementation(async (path: string) => {
    if (path === "/api/v1/guide/state") return { configured: true, enabledChildIds: [] };
    if (path === "/api/v1/children") {
      if (error) throw error;
      return child;
    }
    throw new Error(`unexpected ${path}`);
  });
}

async function fill({ consent = true } = {}) {
  await screen.findByLabelText(addChildCopy.nickname);
  await fireEvent.changeText(screen.getByLabelText(addChildCopy.nickname), "Sam");
  await fireEvent.changeText(screen.getByLabelText(addChildCopy.pin), "1234");
  const user = userEvent.setup();
  if (consent) await user.press(screen.getByRole("checkbox", { name: addChildCopy.consent }));
  await user.press(screen.getByRole("button", { name: addChildCopy.submit }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("add a child", () => {
  it("add child success opens the hub", async () => {
    answer({ child: { id: CHILD, nickname: "Sam" } });
    await renderApp();
    expect(await screen.findByText(jarsoNoticeCopy.title)).toBeOnTheScreen();
    await fill();

    expect(await screen.findByText(`Hub ${CHILD}`)).toBeOnTheScreen();
    expect(screen).toHavePathname(`/children/${CHILD}`);
    expect(api).toHaveBeenCalledWith("/api/v1/children", {
      method: "POST",
      body: { nickname: "Sam", pin: "1234", consent: true },
      auth: true,
    });
    expect(flash).toHaveBeenCalledWith(addChildCopy.added("Sam"));
  });

  it("add child without consent shows the schema message", async () => {
    answer({ child: { id: CHILD, nickname: "Sam" } });
    await renderApp();
    await fill({ consent: false });

    expect(await screen.findByText("A parent needs to say yes first")).toBeOnTheScreen();
    expect(api).not.toHaveBeenCalledWith("/api/v1/children", expect.anything());
  });

  it("nickname taken on add shows the field error", async () => {
    answer({
      error: new AppError("CONFLICT", "Please fix the highlighted fields.", {
        fieldErrors: { nickname: [nicknameTaken] },
      }),
    });
    await renderApp();
    await fill();

    expect(await screen.findByText(nicknameTaken)).toBeOnTheScreen();
    expect(screen.queryByText("Please fix the highlighted fields.")).not.toBeOnTheScreen();
    await waitFor(() => expect(screen).toHavePathname("/children/new"));
  });
});
