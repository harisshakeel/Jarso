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
| `SUPABASE_SECRET_KEY` | not set | not set | Only the admin client needs it and nothing calls it yet. Add it the day a trusted server job does, production only. |
| `LOG_LEVEL` | default `info` | default | Optional. |

To change a value from a terminal: `printf '<value>' | vercel env add NAME production --force` (pipe it; never type a key into a command line). Then redeploy.

## Supabase auth settings for production

Supabase → Authentication → URL Configuration:

- Site URL: `https://jarso.vercel.app`
- Redirect URLs: add `https://jarso.vercel.app/auth/callback` and keep `http://localhost:3000/auth/callback` for local development.

Without the redirect URL, confirmation emails sent from production cannot land back in the app.

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

Migrations are not applied by Vercel. They run from CI or `pnpm db:push` against the linked project; see `docs/database.md`.
