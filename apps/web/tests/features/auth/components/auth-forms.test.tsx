import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

vi.mock("@/features/auth/server/actions", () => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("@/features/offline", () => ({
  useOnlineActionState: () => [null, vi.fn(), false, vi.fn(), true],
}));

afterEach(cleanup);

/**
 * The login and sign-up pages show a placeholder form until the real one streams in, and React
 * swaps it in after load. Whatever is typed into the placeholder is lost, so nothing can be.
 */
describe.each([
  {
    name: "SignUpForm",
    Form: SignUpForm,
    fields: ["Name", "Email", "Password"],
    submit: "Create account",
  },
  { name: "SignInForm", Form: SignInForm, fields: ["Email", "Password"], submit: "Sign in" },
])("$name", ({ Form, fields, submit }) => {
  it("as a placeholder, takes no typing and no submit", () => {
    render(<Form placeholder />);
    for (const label of fields) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole("button", { name: submit })).toBeDisabled();
  });

  it("is usable once it is the real form", () => {
    render(<Form next="/invite?code=ZZZZ22" />);
    for (const label of fields) expect(screen.getByLabelText(label)).toBeEnabled();
    expect(screen.getByRole("button", { name: submit })).toBeEnabled();
  });
});
