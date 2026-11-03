import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { WEB_SIGNUP_URL } from "@/config";
import { ParentSignInForm } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";

jest.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: jest.fn() } },
}));

const signInWithPassword = supabase.auth.signInWithPassword as jest.Mock;

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
});

async function fillIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.press(screen.getByRole("button", { name: "Sign in" }));
}

describe("ParentSignInForm", () => {
  it("signs in with email and password", async () => {
    const user = userEvent.setup();
    await render(<ParentSignInForm />);

    await fillIn(user, "sam@example.com", "secret-pass");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "sam@example.com",
      password: "secret-pass",
    });
  });

  it("parent form shows email errors from signInSchema", async () => {
    const user = userEvent.setup();
    await render(<ParentSignInForm />);

    await fillIn(user, "not-an-email", "");

    expect(await screen.findByText("Enter a valid email")).toBeOnTheScreen();
    expect(screen.getByText("Password is required")).toBeOnTheScreen();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("child domain email refused", async () => {
    const user = userEvent.setup();
    await render(<ParentSignInForm />);

    await fillIn(user, "sam@child.jarso.invalid", "1234");

    expect(await screen.findByText("Enter a valid email")).toBeOnTheScreen();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('wrong password shows "Invalid email or password"', async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: Object.assign(new Error("Invalid login credentials"), {
        code: "invalid_credentials",
        status: 400,
      }),
    });
    const user = userEvent.setup();
    await render(<ParentSignInForm />);

    await fillIn(user, "sam@example.com", "wrong");

    expect(await screen.findByText("Invalid email or password")).toBeOnTheScreen();
    expect(screen.getByLabelText("Password")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("sam@example.com");
  });

  it("says the phone is offline when Supabase can't be reached", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    const user = userEvent.setup();
    await render(<ParentSignInForm />);

    await fillIn(user, "sam@example.com", "secret-pass");

    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    expect(screen.queryByText("Invalid email or password")).not.toBeOnTheScreen();
  });

  it("opens the web sign-up", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(<ParentSignInForm />);

    await user.press(screen.getByLabelText("New to Jarso? Create an account on the web"));

    expect(open).toHaveBeenCalledWith(WEB_SIGNUP_URL);
  });
});
