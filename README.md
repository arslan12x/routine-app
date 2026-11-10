# Routine — private habit & streak tracker (PWA)

Next.js 16 · TypeScript (strict) · Prisma 7 · Supabase Postgres · Better Auth (username/password) · Tailwind 4 · Recharts

## Project documentation

See [PROJECT_GUIDE.md](./PROJECT_GUIDE.md) for user flows, behavior rules, API routes, data model, architecture, deployment, and the development map. Update that guide in the same change whenever app behavior or operations change.

## Local setup
```bash
npm install
npx prisma migrate deploy       # applies all checked-in migrations
npm run db:seed                 # creates/resets admin from INITIAL_ADMIN_* in .env
npm run dev                     # http://localhost:3000
```

If you already ran the earlier empty `0001_init` and `0002_rls_and_checks` failed, Prisma has recorded `0001_init` as applied. On a disposable database, run `npx prisma migrate reset` to rebuild it from the corrected migrations; this deletes data in the Prisma schema. Do not reset a database containing data you need to keep.

After the first run, change the schema normally with `npm run db:migrate` and commit the generated folders.

## Tests
`npm test` runs Vitest on the domain logic. The current suite has 23 tests; it does not include full browser E2E or database integration tests.

Task progress syncs between open `/tasks` screens through Supabase Realtime; Calendar retains periodic refresh. Setup details and the required server-side signing secret are documented in [DEPLOY.md](./DEPLOY.md).

Daily push reminders can be enabled per device in Settings. Production setup, VAPID keys, and the Supabase scheduler are documented in [DEPLOY.md](./DEPLOY.md).

## First-run verification checklist
1. Sign in with `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`: /tasks loads and /admin works.
2. Create a user account at /admin, sign in as that user, then revoke it; their next request is denied.
3. Create a mandatory task, tick it, confirm the streak shows 1; open Calendar and click today.
4. Open /api/leaderboard in the browser: response contains only display name, avatar, streak and aggregate numbers.
5. DevTools > Application: manifest valid, service worker registered (production build only), "Install" available.
