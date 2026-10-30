"use client";

import { useState } from "react";
import { Field, FormError } from "@/components/form";
import { Button, Card, CardContent } from "@/components/ui";
import { useOnlineActionState } from "@/features/offline";
import { childSignInAction } from "../server/actions";

/**
 * /sign-in/child: family code, nickname and PIN. Code and nickname are controlled so they
 * survive a wrong PIN (React resets uncontrolled fields after an action); the PIN clears.
 */
export function ChildSignInForm() {
  const [state, , pending, submit] = useOnlineActionState(childSignInAction);
  const [familyCode, setFamilyCode] = useState("");
  const [nickname, setNickname] = useState("");

  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  return (
    <Card className="rise-in shadow-raised">
      <CardContent>
        <form onSubmit={submit} className="grid gap-6" noValidate>
          <Field
            name="familyCode"
            label="Family code"
            value={familyCode}
            onChange={(event) => setFamilyCode(event.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={16}
            required
            className="font-bold tracking-widest"
            description="Your parent can find it on their Jarso home."
            errors={fieldErrors?.familyCode}
          />
          <Field
            name="nickname"
            label="Your nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            required
            errors={fieldErrors?.nickname}
          />
          <Field
            name="pin"
            label="Your PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            required
            errors={fieldErrors?.pin}
          />
          <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
          <Button type="submit" variant="keycap" size="lg" className="w-full" loading={pending}>
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
