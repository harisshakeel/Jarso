# Deployment

Production runs on Vercel, database and auth on Supabase. Both are in Tokyo so every database call stays in one region.

| | |
| --- | --- |
| Vercel project | `haris-shakeels-projects/jarso` (Hobby) |
| Production URL | https://jarso.vercel.app |
| Function region | `hnd1` (pinned in `vercel.json`) |
| Supabase project | `sbnakvwvaymzypwmpqzv`, region `ap-northeast-1` |
| Health check | https://jarso.vercel.app/api/health → `{"data":{"status":"ok"}}` |

## Environment variables

Set in Vercel → Project → Settings → Environment Variables, never in the repo. Names are declared in `src/config/env.client.ts` and `env.server.ts`; the build fails fast if a required one is missing.

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://jarso.vercel.app` | same as production | Used for email redirect targets and the CSRF origin check. Preview hosts still pass the CSRF check via the host match. |
| `NEXT_PUBLIC_SUPABASE_URL` | set | set | Public by design. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | set | set | Public by design; still never committed. |
| `SUPABASE_SECRET_KEY` | set (sensitive) | set (sensitive) | Required: the admin client creates child auth users (`features/family`). Previews share the production project, so they need it too. Missing it fails add-child with the generic error, which was the hosted bug behind PR #10's known issue. |
| `LOG_LEVEL` | `info` | `info` | Optional. |
| `ANTHROPIC_API_KEY` | set (sensitive) | unset | The money guide (ADR 0010). Server only; read only by `features/guide/server/claude.ts`. |
| `FEATURE_GUIDE` | `true` to run the guide | `false` | Off by default. With it on, Jarso is on for every child unless their parent turns it off (ADR 0011). |
| `GUIDE_DAILY_BUDGET_CENTS` | e.g. `1000` | — | Optional; default 1000 (US$10 a day across all children). The guide shows its break copy once reached. |
| `GUIDE_MONTHLY_BUDGET_CENTS` | e.g. `10000` | — | Optional; default 10000 (US$100 per calendar month, UTC, across all children). The guide shows its break copy once reached. |
| `GUIDE_PROVIDER` | `anthropic` (default) | — | `fake` is for e2e only and is refused on Vercel production. |
| `PAYMENTS_PROVIDER` | `none` (default) or `stripe` | `none` or `stripe` | Card handover (ADR 0012). `none` switches payments off. `fake` is for tests and local runs: it needs `PAYMENTS_ALLOW_FAKE=true` and is refused on Vercel production. |
| `STRIPE_SECRET_KEY` | `sk_test_…` (sensitive) | same | Required when `PAYMENTS_PROVIDER=stripe`. Test keys only: a live key fails validation. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (sensitive) | same | Required when `PAYMENTS_PROVIDER=stripe`. The signing secret of the dashboard endpoint below (not the `stripe listen` one). |
| `CRON_SECRET` | `<cron secret ≥16 chars>` (sensitive) | same | Bearer secret for `/api/cron/payments/auto-charge`. Unset: the route is 404. Vercel Cron sends it as `Authorization: Bearer …` on its own. |

To change a value from a terminal: `printf '<value>' | vercel env add NAME production --force` (pipe it; never type a key into a command line). To take a Supabase key straight from the CLI, pass `--reveal` and pipe the one key into Vercel so it never appears on screen or in a log:

```bash
supabase projects api-keys --project-ref <ref> --reveal -o json \
  | python3 -c 'import json,sys; t=sys.stdin.read(); print(next(k["api_key"] for k in json.loads(t[t.index("["):]) if k["api_key"].startswith("sb_secret_")), end="")' \
  | vercel env add SUPABASE_SECRET_KEY production --sensitive --force
```

Never run the `--reveal` command on its own: it prints every secret key. Without `--reveal` the secret key comes back masked, and a masked value stored on Vercel fails every admin call with the generic "Failed to …" message (this happened on 2026-10-29). Env changes apply to the next deployment only; redeploy or merge afterwards.

### Turning the money guide on

1. In the Anthropic Console, create a workspace for Jarso (the Default workspace can't have a spend limit), set its monthly spend limit to US$100, and create the key in that workspace (Settings → API Keys). That limit is the hard cap: it also covers eval runs and local use, which the app's own budgets don't see. Add the key to Vercel without typing it on a command line: `pbpaste | vercel env add ANTHROPIC_API_KEY production --sensitive --force` (copy it from the Console first), or paste it in the Vercel dashboard.
2. Set `FEATURE_GUIDE=true` for Production, then redeploy or merge (demo and test families only until step 4's gates pass).
3. For the launch gate, create the `guide-evals` environment (GitHub → Settings → Environments) with yourself as a required reviewer, add the same key there as the `ANTHROPIC_API_KEY` environment secret, and run **Guide evals** from the Actions tab. The run fails unless every safety and personal case routes correctly, there are zero FR09 breaks and at least 95% of on-topic answers are helpful.
4. Jarso is on for every child by default once `FEATURE_GUIDE` is on (ADR 0011): every child's messages and looked-up money and learning data go to Anthropic. Until the eval gate passes and the legal review is done, keep `FEATURE_GUIDE` on in Production only while every family there is a demo or test account; turn it off before the first real family signs up.

### Turning card payments on (Stripe test mode)

Card handover is a test-mode showcase (ADR 0012). Use Stripe test keys only; no real money moves. Add every value in the Vercel dashboard or pipe it (`printf '<value>' | vercel env add NAME production --sensitive --force`); never type one on a command line and never paste one into a chat, doc or log.

1. In the Stripe dashboard (test mode), copy the secret key (`sk_test_…`). Set `STRIPE_SECRET_KEY` and `PAYMENTS_PROVIDER=stripe`.
2. Developers → Webhooks → Add endpoint: URL `https://jarso.vercel.app/api/v1/payments/webhooks/stripe`, API version `2026-10-28.endive`, and these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.requires_action`

   Copy the endpoint's signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
3. Generate a cron secret of at least 16 characters (for example `openssl rand -hex 32`, piped straight into Vercel) and set it as `CRON_SECRET`. Redeploy.
4. Create the two Vault secrets so the hourly pg_cron job `charge-due-cards` (minute 9, via pg_net) can call the route. In Supabase → Project Settings → Vault, or the SQL editor:

   ```sql
   select vault.create_secret('https://jarso.vercel.app', 'app_url');
   select vault.create_secret('<cron secret ≥16 chars>', 'cron_secret');
   ```

   `cron_secret` must equal the app's `CRON_SECRET`. Until both exist the job does nothing, so local runs and CI are unaffected. Create them by hand in each environment; they are never in a migration. After rotating `CRON_SECRET`, update the Vault secret too (`docs/security.md`).
5. `vercel.json` already has a daily fallback cron (`30 3 * * *`) on the same route. It works once `CRON_SECRET` is set. Hobby allows daily crons only, which is why pg_cron is the primary.
6. Check: `curl -s -o /dev/null -w '%{http_code}' https://jarso.vercel.app/api/cron/payments/auto-charge` is `401` with payments on (a `404` means `CRON_SECRET` is unset or payments are off). A webhook with a bad signature returns `400`.

**Local development with Stripe.** Set `PAYMENTS_PROVIDER=stripe`, a test `STRIPE_SECRET_KEY` and `CRON_SECRET` in `.env.local`. Run `stripe listen --forward-to localhost:3000/api/v1/payments/webhooks/stripe`; it prints a local `whsec_…`, which goes in `.env.local` as `STRIPE_WEBHOOK_SECRET` (a different value from the dashboard endpoint's). `stripe trigger …` sends sample events. Without Stripe, use `PAYMENTS_PROVIDER=fake` with `PAYMENTS_ALLOW_FAKE=true`; its hosted page is `/dev/payments/fake`.

**Stripe test cards** (any future expiry, any CVC, any postcode):

| Card | Behaviour |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0341` | Saves, then the off-session (auto) charge fails |
| `4000 0027 6000 3184` | Always needs authentication |
| `4000 0000 0000 9995` | Insufficient funds |

**Manual pass against real Stripe test mode** (not run by the agent; it needs real test keys). Run it once per deployment after the steps above, with `stripe listen` for local runs:

- [ ] Family with a due allowance. On the handover screen, tap Pay by card, pay with `4242 4242 4242 4242`. The jars fill, history says "Paid by card", the allowance is no longer due.
- [ ] Open Pay by card, then hand over cash before paying. Pay on the Stripe page afterwards: nothing posts again and the screen shows the refund note.
- [ ] Allowance screen: turn auto charge on for a schedule. With no saved card it asks to save one first: save `4000 0000 0000 0341` on the Stripe page. Back in the app the toggle is on, and Settings → saved card shows its brand and last 4.
- [ ] With that card saved, let an item fall due (or fast-forward the data), run the cron route (`curl -X POST -H "Authorization: Bearer $CRON_SECRET" …`, using the env var so the secret never appears in a log). The charge fails, the allowance stays due and the parent gets a "didn't go through" notice.
- [ ] Remove the card in Settings, turn auto charge on again and save `4242 4242 4242 4242` this time. With another item due, the cron run charges it once and the jars fill. A second run does nothing.
- [ ] Remove the card: auto charge turns off for everything that parent set.
- [ ] A child account sees "paid by card" on the history line and nothing else about payments.
- [ ] Stripe dashboard → Webhooks: the endpoint shows 2xx for each event.

## Supabase auth settings for production

Applied from the repo: `supabase/config.toml` has a `[remotes.production]` block (Site URL, redirect URLs for production and localhost, secure password change, and the hosted-only values pinned). `supabase config diff` previews, `supabase config push --yes` applies. Dashboard-only items and the free-tier email limits are in `docs/auth.md` → "Hosted setup".

Runbook step: Supabase → Authentication → Sessions → Refresh token reuse interval: 30 seconds. Set by someone with dashboard access. It needs no deploy and takes effect immediately.

## How deploys happen

- **Git integration (preferred):** connect the GitHub repo in Vercel → Project → Settings → Git. Afterwards every push to `main` deploys to production and every PR gets a preview URL. CI on GitHub still gates merges; Vercel builds independently.
- **Manual from a machine with the CLI:** `vercel deploy --prod` from the repo root. The CLI uploads the working tree and builds in the cloud; nothing is built locally. Use this only when the Git integration is unavailable.

`vercel link` writes `.vercel/` (project ids) and may write `.env.local` with a short-lived `VERCEL_OIDC_TOKEN`. Both are gitignored. Do not commit either and do not run `vercel env pull` into the repo.

## Verifying a deploy

```bash
curl -s https://jarso.vercel.app/api/health            # {"data":{"status":"ok"}}
curl -sI https://jarso.vercel.app/dashboard | head -1   # 307 to /login?next=%2Fdashboard when signed out
vercel inspect <deployment-url>                         # status, aliases, per-function region
```

Then sign up with a throwaway address, confirm the email, and check a `profiles` row appears in Supabase.

## Rollback

Vercel → Deployments → previous Ready deployment → "Promote to Production", or `vercel rollback` from the CLI. The schema does not roll back; migrations follow expand/contract (`docs/database.md`) so older code keeps working against the newer schema.

## Limits that matter (Hobby plan)

- Serverless function duration is capped; set `maxDuration` on routes that stream (the future guide) and keep cron jobs chunked.
- One concurrent build; a push during a build queues.
- Preview deployments may be behind Vercel Authentication (Deployment Protection). Production is public.

## Database migrations

Vercel does not touch the database. Supabase's GitHub integration applies new migrations to the hosted project when they are merged to `main`, in parallel with the Vercel build. Nothing is stored in GitHub secrets.

One-time setup, in Supabase → Project Settings → Integrations → GitHub Integration:

1. Authorize GitHub and choose `harisshakeel/Jarso`.
2. Working directory `.`; production branch `main`.
3. Turn **Deploy to production** on. Leave automatic (preview) branching off: only `main` deploys.

After each merge that adds a migration, check the deploy in the Supabase dashboard, or run `supabase migration list --linked`. If the integration is off or a deploy fails, run `pnpm db:push` from `main` by hand. Details in `docs/database.md`.
