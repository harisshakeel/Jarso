import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { SignInForm } from "@/features/auth";
import { forgetSignIn, loadSavedSignIn, saveSignIn } from "@/features/auth/saved-sign-in";
import { signInChild } from "@/features/auth/sign-in-child";
import { AppError } from "@/lib";

jest.mock("@/features/auth/sign-in-child", () => ({ signInChild: jest.fn() }));
jest.mock("@/features/auth/saved-sign-in", () => ({
  loadSavedSignIn: jest.fn(),
  saveSignIn: jest.fn(),
  forgetSignIn: jest.fn(),
}));

const signIn = signInChild as jest.Mock;
const load = loadSavedSignIn as jest.Mock;
const save = saveSignIn as jest.Mock;
const forget = forgetSignIn as jest.Mock;

// The exact wording the server sends (apps/web/src/features/family/server/child-auth.ts).
const NO_MATCH = "Hmm, that didn't match. Check with your parent.";
const TOO_MANY = "Too many tries. Ask your parent or wait a little while.";

beforeEach(() => {
  jest.clearAllMocks();
  signIn.mockReset();
  load.mockResolvedValue(null);
  save.mockResolvedValue(undefined);
  forget.mockResolvedValue(undefined);
});

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Family code"), "ab12cd");
  await user.type(screen.getByLabelText("Your nickname"), "Sam");
  await user.type(screen.getByLabelText("Your PIN"), "1234");
}

describe("SignInForm", () => {
  it("asks for the PIN on the number pad and hides it", async () => {
    await render(<SignInForm />);
    const pin = screen.getByLabelText("Your PIN");
    expect(pin).toHaveProp("keyboardType", "number-pad");
    expect(pin).toHaveProp("secureTextEntry", true);
    expect(pin).toHaveProp("maxLength", 6);
  });

  it("sends the details with the family code in capitals", async () => {
    signIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(<SignInForm />);

    await fillIn(user);
    await user.press(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith({ familyCode: "AB12CD", nickname: "Sam", pin: "1234" });
  });

  it.each([
    ["UNAUTHORIZED", NO_MATCH],
    ["RATE_LIMITED", TOO_MANY],
  ] as const)(
    "shows the server's %s message verbatim and clears the PIN",
    async (code, message) => {
      signIn.mockRejectedValue(new AppError(code, message));
      const user = userEvent.setup();
      await render(<SignInForm />);

      await fillIn(user);
      await user.press(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText(message)).toBeOnTheScreen();
      expect(screen.getByLabelText("Your PIN")).toHaveDisplayValue("");
      expect(screen.getByLabelText("Family code")).toHaveDisplayValue("AB12CD");
      expect(screen.getByLabelText("Your nickname")).toHaveDisplayValue("Sam");
    },
  );

  it("checks the fields like the web before sending anything", async () => {
    const user = userEvent.setup();
    await render(<SignInForm />);

    await user.type(screen.getByLabelText("Your PIN"), "12");
    await user.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter your family code")).toBeOnTheScreen();
    expect(screen.getByText("Enter your nickname")).toBeOnTheScreen();
    expect(screen.getByText("Your PIN is 4 to 6 numbers")).toBeOnTheScreen();
    expect(signIn).not.toHaveBeenCalled();
  });

  describe("Remember me on this phone", () => {
    it("is off by default and forgets the details after signing in", async () => {
      signIn.mockResolvedValue(undefined);
      const user = userEvent.setup();
      await render(<SignInForm />);

      expect(screen.getByRole("switch", { name: "Remember me on this phone" })).toHaveProp(
        "value",
        false,
      );
      await fillIn(user);
      await user.press(screen.getByRole("button", { name: "Sign in" }));

      expect(save).not.toHaveBeenCalled();
      expect(forget).toHaveBeenCalled();
    });

    it("saves the details once the sign-in works", async () => {
      signIn.mockResolvedValue(undefined);
      const user = userEvent.setup();
      await render(<SignInForm />);

      await fillIn(user);
      // A Switch reports changes through onValueChange, not a press.
      await fireEvent(
        screen.getByRole("switch", { name: "Remember me on this phone" }),
        "valueChange",
        true,
      );
      await user.press(screen.getByRole("button", { name: "Sign in" }));

      expect(save).toHaveBeenCalledWith({ familyCode: "AB12CD", nickname: "Sam", pin: "1234" });
    });

    it("does not save details that did not work", async () => {
      signIn.mockRejectedValue(new AppError("FORBIDDEN", NO_MATCH));
      const user = userEvent.setup();
      await render(<SignInForm />);

      await fillIn(user);
      await user.press(screen.getByRole("switch", { name: "Remember me on this phone" }));
      await user.press(screen.getByRole("button", { name: "Sign in" }));

      expect(save).not.toHaveBeenCalled();
    });

    it("fills in saved details and switches itself on", async () => {
      load.mockResolvedValue({ familyCode: "AB12CD", nickname: "Sam", pin: "1234" });
      await render(<SignInForm />);

      await waitFor(() =>
        expect(screen.getByLabelText("Family code")).toHaveProp("value", "AB12CD"),
      );
      expect(screen.getByLabelText("Your nickname")).toHaveProp("value", "Sam");
      expect(screen.getByLabelText("Your PIN")).toHaveProp("value", "1234");
      expect(screen.getByRole("switch", { name: "Remember me on this phone" })).toHaveProp(
        "value",
        true,
      );
    });

    it("forgets the saved details as soon as it is switched off", async () => {
      load.mockResolvedValue({ familyCode: "AB12CD", nickname: "Sam", pin: "1234" });
      await render(<SignInForm />);
      const toggle = screen.getByRole("switch", { name: "Remember me on this phone" });
      await waitFor(() => expect(toggle).toHaveProp("value", true));

      await fireEvent(toggle, "valueChange", false);

      expect(forget).toHaveBeenCalled();
    });
  });
});
