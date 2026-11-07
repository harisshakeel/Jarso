import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
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

// A fake expo-camera: the "camera" is a button per test that reads a given QR text.
let mockCamera: unknown = null;
jest.mock("@/features/auth/camera", () => ({ loadCamera: () => mockCamera }));
const requestPermission = jest.fn();
let permission = { granted: true };
let scannedText = "";
function useFakePermissions() {
  return [permission, requestPermission];
}
function FakeCameraView({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) {
  return (
    <Text accessibilityRole="button" onPress={() => onBarcodeScanned({ data: scannedText })}>
      Fake camera
    </Text>
  );
}
function fakeCamera() {
  return { useCameraPermissions: useFakePermissions, CameraView: FakeCameraView };
}

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
  mockCamera = null;
  permission = { granted: true };
  requestPermission.mockReset();
  scannedText = "";
});

describe("scanning the parent's code", () => {
  it("shows no scan button on a build without the camera", async () => {
    await render(<SignInForm />);
    expect(screen.queryByRole("button", { name: "Scan the code" })).not.toBeOnTheScreen();
  });

  it("a Jarso code fills in the family code and nickname, never a PIN", async () => {
    mockCamera = fakeCamera();
    scannedText = "jarso://sign-in?code=kq74mx&nickname=Sam&pin=9999";
    const user = userEvent.setup();
    await render(<SignInForm />);

    await user.press(screen.getByRole("button", { name: "Scan the code" }));
    await user.press(screen.getByRole("button", { name: "Fake camera" }));

    expect(await screen.findByText("Got it! Now tap your PIN.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Family code")).toHaveProp("value", "KQ74MX");
    expect(screen.getByLabelText("Your nickname")).toHaveProp("value", "Sam");
    expect(screen.getByLabelText("Your PIN")).toHaveAccessibilityValue(pinTyped(0));
  });

  it("another code says it isn't a Jarso code and keeps scanning", async () => {
    mockCamera = fakeCamera();
    scannedText = "https://example.com/menu";
    const user = userEvent.setup();
    await render(<SignInForm />);

    await user.press(screen.getByRole("button", { name: "Scan the code" }));
    await user.press(screen.getByRole("button", { name: "Fake camera" }));

    expect(await screen.findByText("That's not a Jarso code. Try another!")).toBeOnTheScreen();
    expect(screen.getByLabelText("Family code")).toHaveProp("value", "");
  });

  it("a denied camera says to type the code", async () => {
    mockCamera = fakeCamera();
    permission = { granted: false };
    requestPermission.mockResolvedValue({ granted: false });
    const user = userEvent.setup();
    await render(<SignInForm />);

    await user.press(screen.getByRole("button", { name: "Scan the code" }));

    expect(await screen.findByText("No camera? Type the code instead.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Fake camera" })).not.toBeOnTheScreen();
  });

  it("details from a sign-in link fill in the form", async () => {
    await render(<SignInForm initial={{ familyCode: "KQ74MX", nickname: "Mia" }} />);
    expect(screen.getByLabelText("Family code")).toHaveProp("value", "KQ74MX");
    expect(screen.getByLabelText("Your nickname")).toHaveProp("value", "Mia");
  });

  it("a link for another child keeps its own details over the saved ones", async () => {
    load.mockResolvedValue({ familyCode: "AB12CD", nickname: "Sam", pin: "1234" });
    await render(<SignInForm initial={{ familyCode: "KQ74MX", nickname: "Mia" }} />);
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(screen.getByLabelText("Family code")).toHaveProp("value", "KQ74MX");
    expect(screen.getByLabelText("Your PIN")).toHaveAccessibilityValue(pinTyped(0));
  });
});

async function typePin(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const digit of digits) await user.press(screen.getByTestId(`pin-key-${digit}`));
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Family code"), "ab12cd");
  await user.type(screen.getByLabelText("Your nickname"), "Sam");
  await typePin(user, "1234");
}

const pinTyped = (n: number) => ({ text: n === 1 ? "1 number typed" : `${n} numbers typed` });

describe("SignInForm", () => {
  it("takes the PIN on a pad, as dots, up to 6 numbers, with Delete", async () => {
    const user = userEvent.setup();
    await render(<SignInForm />);
    const pin = screen.getByLabelText("Your PIN");
    expect(pin).toHaveAccessibilityValue(pinTyped(0));

    await typePin(user, "1234567");
    expect(pin).toHaveAccessibilityValue(pinTyped(6));
    // Dots only: no digit of the PIN is ever on screen.
    expect(screen.queryByText("123456")).not.toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Delete" }));
    expect(pin).toHaveAccessibilityValue(pinTyped(5));
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
      expect(screen.getByLabelText("Your PIN")).toHaveAccessibilityValue(pinTyped(0));
      expect(screen.getByLabelText("Family code")).toHaveDisplayValue("AB12CD");
      expect(screen.getByLabelText("Your nickname")).toHaveDisplayValue("Sam");
    },
  );

  it("checks the fields like the web before sending anything", async () => {
    const user = userEvent.setup();
    await render(<SignInForm />);

    await typePin(user, "12");
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
      expect(screen.getByLabelText("Your PIN")).toHaveAccessibilityValue(pinTyped(4));
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
