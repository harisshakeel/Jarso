# Architecture Decision Records

Short records of significant decisions. Copy `0000-template.md`, increment the number, keep it under a page.

| # | Decision | Status |
| --- | --- | --- |
| [0001](./0001-nextjs-fullstack-feature-modules.md) | Next.js full-stack app organised by feature modules | Accepted |
| [0002](./0002-supabase.md) | Supabase for database and auth, RLS as authorization backstop | Accepted |
| [0003](./0003-biome-and-barrels.md) | Biome for lint/format; index barrels as module boundaries | Accepted |
| [0004](./0004-child-identity-pin-sign-in.md) | Child identity: parent-created account, family code + nickname + PIN sign-in | Accepted |
| [0005](./0005-families-hub-model.md) | Families as a hub table with many parents and many children | Accepted |
| [0006](./0006-notifications-as-derived-records.md) | Notifications as derived records with inbox, email and push channels | Accepted |
| [0007](./0007-removing-a-child.md) | Removing a child deletes the identity while there is no money history | Accepted |
| [0008](./0008-parent-profile-completion.md) | Parents complete a private profile before using the app | Accepted |
| [0009](./0009-learning-content-as-code.md) | Learning content as versioned JSON, progress in Postgres | Accepted |
| [0010](./0010-ai-money-guide.md) | AI money guide: a screened Claude pipeline behind two switches | Accepted |
| [0011](./0011-jarso-agent.md) | Jarso, the agent: read-only look-ups of the child's own data, figures the app fills in | Accepted |
| [0012](./0012-web-push.md) | Web push from the notice row itself, with no delivery table | Accepted |
| [0013](./0013-card-handover-payment-providers.md) | Card handover through payment providers: one interface, Stripe test mode first | Accepted; partly superseded by 0014 |
| [0014](./0014-several-payment-providers-razorpay.md) | Several payment providers at once, and Razorpay | Accepted |
| [0015](./0015-monorepo-and-mobile.md) | Monorepo with a shared core for the mobile app | Accepted; twin-route part superseded by 0016 |
| [0016](./0016-mobile-direct-supabase.md) | Mobile reads and writes through Supabase directly; /api/v1 only for server secrets | Accepted; supersedes the twin-route part of 0015 |
| [0017](./0017-bearer-request-scope.md) | Request-scoped bearer auth: routes opt in, services run unchanged | Accepted; extends 0016 |
| [0018](./0018-native-payment-sheets.md) | Card payments on the phone through the providers' native sheets | Accepted; extends 0013, 0014 |
| [0019](./0019-allowance-split.md) | The allowance carries a planned Spend/Save split (Save stored, Spend the rest) | Accepted |
