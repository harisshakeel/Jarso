import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { WEB_SIGNUP_URL } from "@/config";
import { ParentSignInForm } from "@/features/auth";
import {
  forgetParentSignIn,
  loadSavedParentSignIn,
  saveParentSignIn,
} from "@/features/auth/saved-sign-in";
import { supabase } from "@/lib/supabase/client";

jest.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: jest.fn() } },
}));

jest.mock("@/features/auth/saved-sign-in", () => ({
  loadSavedParentSignIn: jest.fn(),
  saveParentSignIn: jest.fn(),
  forgetParentSignIn: jest.fn(),
}));

const signInWithPassword = supabase.auth.signInWithPassword as jest.Mock;
const load = loadSavedParentSignIn as jest.Mock;
const save = saveParentSignIn as jest.Mock;
const forget = forgetParentSignIn as jest.Mock;
const REMEMBER = "Remember me on this phone";

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  load.mockReset().mockResolvedValue(null);
  save.mockReset().mockResolvedValue(undefined);
  forget.mockReset().mockResolvedValue(undefined);
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

  describe("Remember me on this phone", () => {
    it("is off by default and forgets the details after signing in", async () => {
      const user = userEvent.setup();
      await render(<ParentSignInForm />);

      expect(screen.getByRole("switch", { name: REMEMBER })).toHaveProp("value", false);
      await fillIn(user, "sam@example.com", "secret-pass");

      expect(save).not.toHaveBeenCalled();
      expect(forget).toHaveBeenCalled();
    });

    it("saves the email and password once the sign-in works", async () => {
      const user = userEvent.setup();
      await render(<ParentSignInForm />);

      // A Switch reports changes through onValueChange, not a press.
      await fireEvent(screen.getByRole("switch", { name: REMEMBER }), "valueChange", true);
      await fillIn(user, "sam@example.com", "secret-pass");

      expect(save).toHaveBeenCalledWith({ email: "sam@example.com", password: "secret-pass" });
    });

    it("does not save details that did not work", async () => {
      signInWithPassword.mockResolvedValue({
        data: {},
        error: Object.assign(new Error("Invalid login credentials"), {
          code: "invalid_credentials",
          status: 400,
        }),
      });
      const user = userEvent.setup();
      await render(<ParentSignInForm />);

      await fireEvent(screen.getByRole("switch", { name: REMEMBER }), "valueChange", true);
      await fillIn(user, "sam@example.com", "wrong-pass");

      expect(save).not.toHaveBeenCalled();
    });

    it("fills in saved details and switches itself on", async () => {
      load.mockResolvedValue({ email: "sam@example.com", password: "secret-pass" });
      await render(<ParentSignInForm />);

      await waitFor(() =>
        expect(screen.getByLabelText("Email")).toHaveDisplayValue("sam@example.com"),
      );
      expect(screen.getByLabelText("Password")).toHaveDisplayValue("secret-pass");
      expect(screen.getByRole("switch", { name: REMEMBER })).toHaveProp("value", true);
    });

    it("forgets the saved details as soon as it is switched off", async () => {
      load.mockResolvedValue({ email: "sam@example.com", password: "secret-pass" });
      await render(<ParentSignInForm />);
      const toggle = screen.getByRole("switch", { name: REMEMBER });
      await waitFor(() => expect(toggle).toHaveProp("value", true));

      await fireEvent(toggle, "valueChange", false);

      expect(forget).toHaveBeenCalled();
    });
  });
});
