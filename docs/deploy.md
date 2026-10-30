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
| `FEATURE_GUIDE` | `true` to run the guide | `false` | Off by default. With it on, each child still needs their parent's switch. |
| `GUIDE_DAILY_BUDGET_CENTS` | e.g. `1000` | — | Optional; default 1000 (US$10 a day across all children). The guide shows its break copy once reached. |
| `GUIDE_MONTHLY_BUDGET_CENTS` | e.g. `10000` | — | Optional; default 10000 (US$100 per calendar month, UTC, across all children). The guide shows its break copy once reached. |
| `GUIDE_PROVIDER` | `anthropic` (default) | — | `fake` is for e2e only and is refused on Vercel production. |

To change a value from a terminal: `printf '<value>' | vercel env add NAME production --force` (pipe it; never type a key into a command line). To take a Supabase key straight from the CLI, pass `--reveal` and pipe the one key into Vercel so it never appears on screen or in a log:

```bash
supabase projects api-keys --project-ref <ref> --reveal -o json \
  | python3 -c 'import json,sys; t=sys.stdin.read(); print(next(k["api_key"] for k in json.loads(t[t.index("["):]) if k["api_key"].startswith("sb_secret_")), end="")' \
  | vercel env add SUPABASE_SECRET_KEY production --sensitive --force
```

Never run the `--reveal` command on its own: it prints every secret key. Without `--reveal` the secret key comes back masked, and a masked value stored on Vercel fails every admin call with the generic "Failed to …" message (this happened on 2026-10-29). Env changes apply to the next deployment only; redeploy or merge afterwards.

### Turning the money guide on

1. In the Anthropic Console, create a workspace for Jarso (the Default workspace can't have a spend limit), set its monthly spend limit to US$100, and create the key in that workspace (Settings → API Keys). That limit is the hard cap: it also covers eval runs and local use, which the app's own budgets don't see. Add the key to Vercel without typing it on a command line: `pbpaste | vercel env add ANTHROPIC_API_KEY production --sensitive --force` (copy it from the Console first), or paste it in the Vercel dashboard.
2. Set `FEATURE_GUIDE=true` for Production, then redeploy or merge.
3. For the launch gate, create the `guide-evals` environment (GitHub → Settings → Environments) with yourself as a required reviewer, add the same key there as the `ANTHROPIC_API_KEY` environment secret, and run **Guide evals** from the Actions tab. The run fails unless every safety and personal case routes correctly, there are zero FR09 breaks and at least 95% of on-topic answers are helpful.
4. Until the gate passes and the legal review is done, turn the guide on only for the demo family's child (their parent's switch). Every other child stays off by default.

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
