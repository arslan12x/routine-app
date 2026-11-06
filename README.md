# Routine — private habit & streak tracker (PWA)

Next.js 16 · TypeScript (strict) · Prisma 7 · Supabase Postgres · Better Auth (Google) · Tailwind 4 · Recharts

## What is verified and what is not
- `src/lib/domain/*` (streaks, schedules, analytics, ranking) is pure TypeScript, type-checks, and `tests/domain.test.ts` passes (18 tests).
- Everything else (Next.js pages, API routes, Prisma, Better Auth, PWA) was written against the libraries' documented APIs
  but **has not been built or run**. Expect to fix small compile or API-name issues on first `npm run build`.
- Not included: component tests, Playwright E2E, DB integration tests (whitelist, ownership). See "Testing".

## Local setup
```bash
npm install
# Configure .env using .env.example and DEPLOY.md.
# Migrations are already checked in; do not regenerate 0001_init.
npx prisma migrate deploy       # applies 0001_init, then 0002_rls_and_checks
npm run dev                     # http://localhost:3000
```

If you already ran the earlier empty `0001_init` and `0002_rls_and_checks` failed, Prisma has recorded `0001_init` as applied. On a disposable database, run `npx prisma migrate reset` to rebuild it from the corrected migrations; this deletes data in the Prisma schema. Do not reset a database containing data you need to keep.

After the first run, change the schema normally with `npm run db:migrate` and commit the generated folders.

## Tests
`npm test` runs Vitest on the domain logic.

## First-run verification checklist
1. Sign in with `INITIAL_ADMIN_EMAIL`: you land on /tasks and /admin works.
2. Sign in with a Google account that is NOT invited: you see /access-denied and **no row** appears in the `User` table.
3. Invite a friend at /admin, sign in as them, then revoke: their next request redirects to /access-denied.
4. Create a mandatory task, tick it, confirm the streak shows 1; open Calendar and click today.
5. Open /api/leaderboard in the browser: response contains only display name, avatar, streak and aggregate numbers.
6. DevTools > Application: manifest valid, service worker registered (production build only), "Install" available.
