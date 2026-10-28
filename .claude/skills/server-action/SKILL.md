---
name: server-action
description: Add a Server Action using createAction with Zod validation, auth, a service call, cache refresh, and a client form wired with useActionState. Use for any mutation triggered from the app's own UI.
---

# Server Action

## 1. Schema — `src/features/<f>/schemas.ts`

```ts
export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceMinor: z.coerce.number().int().positive(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
```

`FormData` values are strings — use `z.coerce` for numbers/booleans.

## 2. Action — `src/features/<f>/server/actions.ts`

```ts
"use server";

import { refresh } from "next/cache";
import { assertUser } from "@/features/auth/server";
import { createAction } from "@/lib";
import { createGoalSchema } from "../schemas";
import { createGoal } from "./service";

export const createGoalAction = createAction(createGoalSchema, async (input) => {
  const user = await assertUser();
  const goal = await createGoal(user.id, input);
  refresh();
  return goal;
});
```

Export it from the feature's `index.ts`: `export { createGoalAction } from "./server/actions";`

## 3. Form — `src/features/<f>/components/<thing>-form.tsx`

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { idle } from "@/lib";
import { createGoalAction } from "../server/actions";

export function CreateGoalForm() {
  const [state, action, pending] = useActionState(createGoalAction, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  return <form action={action}>{/* fields; show fieldErrors?.name?.[0] */}<Button disabled={pending}>Save</Button></form>;
}
```

## Rules

- Never `try/catch` around `redirect()`; `createAction` rethrows Next control flow.
- Authorization inside the action/service, not the component.
- Return only what the UI needs.
- Test the schema; test the service with a mocked repository.
