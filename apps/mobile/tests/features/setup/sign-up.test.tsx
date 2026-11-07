import { setupFlowCopy } from "@jarso/core/setup";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import { loadSignInMode, saveSignInMode } from "@/features/auth/saved-sign-in";
import { resendEmailCode, signUpParent, verifyEmailCode } from "@/features/setup";
import { logger } from "@/lib";

let mockSession: { status: string; role?: string; userId?: string } = { status: "signed-out" };
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ ...mockSession, retry: jest.fn(), signOut: jest.fn() }),
}));
jest.mock("@/features/auth/saved-sign-in", () => ({
  loadSignInMode: jest.fn(),
  saveSignInMode: jest.fn(async () => undefined),
  loadSavedSignIn: jest.fn(async () => null),
  saveSignIn: jest.fn(),
  forgetSignIn: jest.fn(async () => undefined),
  loadSavedParentSignIn: jest.fn(async () => null),
  saveParentSignIn: jest.fn(),
  forgetParentSignIn: jest.fn(async () => undefined),
}));
jest.mock("@/features/auth/camera", () => ({ loadCamera: () => null }));
const mockAuth = { signUp: jest.fn(), verifyOtp: jest.fn(), resend: jest.fn() };
// Read at call time: the factory runs before this file's consts are initialised.
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockAuth.signUp(...args),
      verifyOtp: (...args: unknown[]) => mockAuth.verifyOtp(...args),
      resend: (...args: unknown[]) => mockAuth.resend(...args),
    },
  },
}));

const copy = setupFlowCopy;
const EMAIL = "parent@example.com";

function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      "(auth)/sign-in": require("../../../app/(auth)/sign-in"),
      "(auth)/welcome": require("../../../app/(auth)/welcome"),
      "(auth)/sign-up": require("../../../app/(auth)/sign-up"),
      "(parent)/setup": () => <Text>Parent setup</Text>,
    },
    { initialUrl },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { status: "signed-out" };
  (loadSignInMode as jest.Mock).mockResolvedValue(null);
  mockAuth.signUp.mockReset();
  mockAuth.verifyOtp.mockReset();
  mockAuth.resend.mockReset();
});

describe("signUpParent and the email code", () => {
  const input = { email: EMAIL, password: "long enough", fullName: "Priya" };

  it("a session from signUp goes straight on", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    await expect(signUpParent(input)).resolves.toBe("signed-in");
    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: "long enough",
      options: {
        data: { full_name: "Priya" },
        emailRedirectTo: expect.stringContaining("/auth/callback"),
      },
    });
  });

  it("no session asks for the code", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    await expect(signUpParent(input)).resolves.toBe("verify");
  });

  it("a refusal reads one calm line and logs no address", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    mockAuth.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: "user_already_exists", status: 422 },
    });
    await expect(signUpParent(input)).rejects.toMatchObject({
      code: "VALIDATION",
      message: copy.account.refused,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(EMAIL);
    warn.mockRestore();
  });

  it("offline says offline", async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    await expect(signUpParent(input)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("a code is checked as an email code", async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await verifyEmailCode(EMAIL, "123456");
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: "123456",
      type: "email",
    });
  });

  it("a code that doesn't match says so calmly", async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } });
    await expect(verifyEmailCode(EMAIL, "000000")).rejects.toMatchObject({
      message: copy.verify.noMatch,
    });
  });

  it("asking again too soon says to wait", async () => {
    mockAuth.resend.mockResolvedValue({
      data: {},
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    await expect(resendEmailCode(EMAIL)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: copy.verify.slowDown,
    });
    expect(mockAuth.resend).toHaveBeenCalledWith({ type: "signup", email: EMAIL });
  });
});

describe("welcome", () => {
  it("a phone nobody signed in on opens Welcome", async () => {
    await renderApp("/sign-in");
    expect(await screen.findByText(copy.welcome.title)).toBeOnTheScreen();
    expect(screen).toHavePathname("/welcome");
  });

  it("a saved choice keeps the sign-in screen", async () => {
    (loadSignInMode as jest.Mock).mockResolvedValue("child");
    await renderApp("/sign-in");
    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
    expect(screen).toHavePathname("/sign-in");
  });

  it("a sign-in link opens the child's form filled in, even on a new phone", async () => {
    await renderApp("/sign-in?code=kq74mx&nickname=Sam");
    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
    expect(screen.getByLabelText("Family code")).toHaveProp("value", "KQ74MX");
    expect(screen.getByLabelText("Your nickname")).toHaveProp("value", "Sam");
  });

  it("I'm a kid keeps the choice and opens the child's sign-in", async () => {
    await renderApp("/welcome");
    await userEvent.setup().press(await screen.findByRole("button", { name: copy.welcome.child }));
    expect(saveSignInMode).toHaveBeenCalledWith("child");
    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
  });

  it("I have an account opens the parent's sign-in, which links to sign-up", async () => {
    await renderApp("/welcome");
    await userEvent.setup().press(
      await screen.findByRole("button", {
        name: `${copy.welcome.haveAccount}. ${copy.welcome.signIn}`,
      }),
    );
    expect(saveSignInMode).toHaveBeenCalledWith("parent");
    expect(await screen.findByLabelText("Email")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: copy.createAccount })).toBeOnTheScreen();
  });
});

describe("sign-up screens", () => {
  async function toAccount() {
    await renderApp("/welcome");
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: copy.welcome.parent }));
    expect(await screen.findByText("Two jars")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: copy.next }));
    await user.press(screen.getByRole("button", { name: copy.next }));
    await user.press(screen.getByRole("button", { name: copy.next }));
    expect(await screen.findByText(copy.account.title)).toBeOnTheScreen();
    return user;
  }

  async function fillAccount(user: ReturnType<typeof userEvent.setup>, email = EMAIL) {
    await fireEvent.changeText(screen.getByLabelText(copy.account.email), email);
    await fireEvent.changeText(screen.getByLabelText(copy.account.password), "long enough");
    await fireEvent.changeText(screen.getByLabelText(copy.account.name), "Priya");
    await user.press(screen.getByRole("button", { name: copy.account.submit }));
  }

  it("how it works steps through three cards to the account; Skip does too", async () => {
    await toAccount();
    await userEvent.setup().press(screen.getByRole("button", { name: copy.back }));
    await userEvent.setup().press(await screen.findByRole("button", { name: copy.skip }));
    expect(await screen.findByText(copy.account.title)).toBeOnTheScreen();
  });

  it("checks the fields like the web before sending anything", async () => {
    const user = await toAccount();
    await fillAccount(user, "kid@child.jarso.invalid");
    expect(await screen.findByText("Enter a valid email")).toBeOnTheScreen();
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  it("with the email check on: the code screen, a good code, and a minute between codes", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    mockAuth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    mockAuth.resend.mockResolvedValue({ data: {}, error: null });
    const user = await toAccount();
    jest.useFakeTimers();
    try {
      await fillAccount(user);
      expect(await screen.findByText(copy.verify.title)).toBeOnTheScreen();
      expect(screen.getByText(copy.verify.sent(EMAIL))).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: copy.verify.wait(60) })).toBeDisabled();

      await act(async () => jest.advanceTimersByTime(60_000));
      await fireEvent.press(screen.getByRole("button", { name: copy.verify.resend }));
      await waitFor(() => expect(mockAuth.resend).toHaveBeenCalled());
      expect(await screen.findByText(copy.verify.resent)).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText(copy.verify.code), "123 456");
      await fireEvent.press(screen.getByRole("button", { name: copy.verify.submit }));
      await waitFor(() =>
        expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
          email: EMAIL,
          token: "123456",
          type: "email",
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("a code that doesn't match stays on the code screen", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    mockAuth.verifyOtp.mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } });
    const user = await toAccount();
    await fillAccount(user);
    await fireEvent.changeText(await screen.findByLabelText(copy.verify.code), "000000");
    await user.press(screen.getByRole("button", { name: copy.verify.submit }));
    expect(await screen.findByText(copy.verify.noMatch)).toBeOnTheScreen();
  });

  it("a signed-in parent goes on to setup", async () => {
    mockSession = { status: "parent", role: "parent", userId: "parent-1" };
    await renderApp("/sign-up");
    expect(await screen.findByText("Parent setup")).toBeOnTheScreen();
  });
});
