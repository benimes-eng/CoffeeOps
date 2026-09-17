# CoffeeOps

CoffeeOps is a web application for managing coffee supply-chain operations: organisations, members, lots, shipments, quality controls, inventory and reporting.

## Local development

Requirements: Node.js 20–24 and npm 10 or later.

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env` and set the Supabase URL and publishable key. Never commit `.env` or any Supabase service-role key.

Useful checks:

```sh
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## Production release checklist

1. In Supabase Auth, set the production Site URL and allowed redirect URLs, enable email confirmation, and configure a real SMTP provider.
2. Create the first administrator as a normal verified account, then promote that exact email with an audited, one-time database operation. CoffeeOps intentionally has no public bootstrap route or default administrator password.
3. Deploy database migrations with `npx supabase db push --project-ref <project-ref>`.
4. Set `ALLOWED_ORIGINS` on the `manage-users` Edge Function to the exact production origins, then deploy it with `npx supabase functions deploy manage-users --project-ref <project-ref>`.
5. Build the application with `npm run build` and deploy the `dist` directory to Cloudflare Workers/Pages. The `_headers` file supplies browser security headers and asset caching.
6. Verify sign-up, verified sign-in, administrator approvals, role changes, logout, and page loads in the deployed environment.
7. Configure production monitoring, alerting, regular restore tests, and a backup/PITR policy in the services that host the application and database.

## Security model

The browser uses only the Supabase publishable/anonymous key. Privileged account-management operations run through the `manage-users` Edge Function, which verifies the caller's user ID and super-admin role server-side. Row-level security remains the data-access boundary. Keep production origins explicit and never expose service-role credentials to the client.
