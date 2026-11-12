# Routine Tracker — Project Guide

This document is the maintained, high-level reference for the app's purpose, user flows, rules, architecture, and operations. It is intended to give a developer or AI coding assistant enough context to work on the project without guessing.

**Maintenance rule for future changes:** when changing user-visible behavior, business rules, API routes, data models, authentication, deployment, or scheduled jobs, update the relevant sections of this guide in the same change. Re-read the implementation and make the guide match the code; code is authoritative if this document ever disagrees. Update the “Guide checked” date below. Do not copy secrets, real account credentials, or `.env` values into this file.

**Guide checked:** 2026-11-12

## What the app does

Routine is a private, installable daily habit/routine tracker for a small group. Administrators provision accounts inside a single workspace organization and assign member/admin/owner roles. Members record daily or weekly task progress, review their history and trends, optionally share aggregate streak statistics on a friends leaderboard, and can enable device-specific push reminders.

The app is not a public self-registration service. It uses username/password credentials; Google sign-in is not part of the current sign-in flow. The UI is responsive and installable as a PWA. Task changes are stored in PostgreSQL and synchronized to other open `/tasks` screens using Supabase Realtime.

## Stack and runtime

- Next.js 16 App Router, React 19, TypeScript (strict mode).
- Tailwind CSS 4 and shared UI components under `src/components/`.
- Sonner provides app-wide toast feedback; Capacitor Haptics provides light impact feedback in native builds.
- IndexedDB via `idb-keyval` caches the daily task view and stores user-scoped offline progress mutations for reconnect sync.
- Better Auth with the username plugin and a Prisma adapter.
- Prisma 7 with the PostgreSQL driver adapter; Supabase Postgres is the deployment database.
- Supabase JS Realtime client for owner-scoped live updates in Tasks.
- Inngest schedules and runs retryable background workers for push reminders.
- Vercel hosts the Next.js app and Vercel Analytics is mounted in the root layout.
- Web Push (`web-push`) and a service worker deliver optional reminders.
- Vitest tests pure domain rules in `tests/domain.test.ts`.

### Request/data flow

1. A route or server page calls `requireUser()` / `pageUser()` to authenticate and confirm that the account is still allowed.
2. API route handlers use the shared `route()` wrapper in `src/lib/api.ts`. It applies same-origin checks to mutations, validates request data with Zod, returns private/no-store JSON, and translates known `ApiError`s into client responses.
3. Route handlers call server services under `src/server/services/`.
4. User services use `withUserDb(userId, callback)` from `src/lib/db.ts`, which applies the authenticated PostgreSQL role and user claims within one transaction. Explicit `systemDb` use is reserved for authentication, account administration, health checks, and scheduled/global aggregate work.
5. Date/schedule/streak/analytics calculations live in mostly pure functions under `src/lib/domain/`.
6. Server-rendered page components pass initial data to interactive client screens under `src/features/`. Client screens use `src/lib/fetcher.ts` for API calls; the Tasks screen also uses `src/lib/supabase.ts` for authenticated Realtime events.

## User roles and account lifecycle

### Member

- Can sign in, manage their own tasks and progress, inspect calendar/insights, adjust settings, export their own task data, and opt into push reminders.
- Appears on Friends only when “Show me on the friends leaderboard” is enabled.

### Admin / Owner

- Has member capabilities plus access to `/admin`.
- Can create a username/password account with a real email, revoke access, and restore access.
- Accounts are provisioned into the default workspace organization and assigned a member/admin/owner role from the organization membership model.
- An administrator cannot revoke their own account through the UI/API.

### Sign-in and authorization

1. An admin creates/provisions an account with a username, real email address, and temporary password. Public sign-up is disabled in Better Auth.
2. The account is inserted into the `User` table and automatically assigned a `Member` record in the default workspace organization (for example `routine-workspace`).
3. Sign-in accepts either the account username or its registered email address. Better Auth's username plugin handles username sign-in; email addresses use Better Auth's credential email sign-in. Organization membership roles (`owner`, `admin`, `member`) are separate from Better Auth's global user roles; the admin plugin's global `adminRoles` only includes the configured global `admin` role.
4. Passwords are hashed by Better Auth's password utility and stored in the credential account record; plaintext passwords are not stored.
5. Protected server requests re-check the session and the user's active organization membership. A banned or revoked user is denied; revocation deletes their sessions.
6. Unauthenticated page visits go to `/login`; an account without active workspace membership goes to `/access-denied`.
7. Sign-out calls Better Auth and returns the user to `/login`.

Important auth implementation: `src/lib/auth/auth.ts`, `src/lib/auth/session.ts`, `src/app/(auth)/login/page.tsx`, `src/server/services/admin.ts`, and `prisma/schema.prisma`.

### Enterprise migration path

The app has moved away from the legacy synthetic-email allowlist model toward an organization-scoped workspace model. Accounts are now created with real email addresses and joined to the default `routine-workspace` organization via a `Member` row. The `organization` and `admin` Better Auth plugins enforce workspace membership and role checks, while `systemDb` is reserved for global admin/system operations and `withUserDb()` is used for user-scoped database access.

If a legacy database still contains `*@users.routine.invalid` records, run the migration prep step before applying the tenant migration:

```bash
npm run db:prepare-enterprise
```

This script reads `LEGACY_ACCOUNT_EMAILS` (for example `arslan=alamxarslan@gmail.com,suzanne=suzanne.dsouza@gmail.com`) or falls back to `INITIAL_ADMIN_EMAIL` when only one legacy account needs a mapping. It updates synthetic `User` emails and matching legacy `AllowedEmail` entries together so the organization migration can preserve each account's role and revocation state.

## Screens and user journeys

### `/` — entry

Redirects to `/tasks`; page authorization then sends a signed-out user to `/login`.

### `/tasks` — daily routine

- After authentication, the page streams its task-data region under React Suspense with a task skeleton fallback. The server fetches tasks and logs in parallel before rendering the interactive screen, using the user's saved timezone.
- Shows the day greeting/date, task progress, current streak, and Mandatory/Extra sections.
- User can create, edit, archive, or delete a task, and mark progress.
- When an account has no tasks, the dashboard offers one-click daily measurable templates for walking 10,000 steps or reading 10 pages. Choosing one creates the task and refreshes the dashboard.
- The task editor modal is dynamically loaded when opened, keeping its form code out of the initial Tasks client bundle.
- Boolean tasks toggle complete/incomplete. Measurable tasks accept a numeric value. Weekly-total tasks accumulate progress over the configured week.
- Task completion updates optimistically without a spinner and triggers light haptics on supported native platforms. Progress writes run in the background in per-task order; failures restore the prior value and show an error toast.
- Completing every mandatory task for today triggers a confetti reward, success toast, and success haptic on supported native platforms. The reward fires once per day and does not trigger for an initially completed screen or historical dates.
- The latest daily task view is cached per account in IndexedDB. Progress changes made offline are queued per account and replayed in order when the browser emits its `online` event.
- This screen listens for owner-scoped database events and refreshes from the server when an event arrives. It also refreshes when the browser returns online/foreground to cover missed events.
- Past days can be opened via Calendar; task progress can be edited today and for the preceding seven days. Older dates and future dates are read-only/not editable.

Main implementation: `src/app/(dashboard)/tasks/page.tsx`, `src/features/tasks/TasksScreen.tsx`, `TaskDialog.tsx`, `DayTasks.tsx`, and `src/server/services/tasks.ts`.

### Creating, changing, archiving, and deleting tasks

- A task has a title, optional description, category, start date, and one or more rule versions.
- Completion type is Boolean or Measurable. Completion type cannot be changed through the edit form after task creation.
- Recurrence is Daily, selected Weekdays, or Weekly Total.
- Weekly Total is always an optional/Extra task and is never part of a daily streak.
- A measurable task is complete when its recorded value reaches its target. A Boolean task is complete when its value is 1.
- Cosmetic changes (title, description, category) update the task identity. Rule changes (mandatory, recurrence, weekdays, target, unit) create/update a version effective from today (or the future task's start date), preserving the rules used for past dates.
- Archive is one-way in the UI and stops future scheduling beginning on the archive date; history is retained.
- Permanent delete is permitted only when the task has no progress history. Otherwise the server rejects deletion and directs the user to archive.
- Validation prevents non-positive targets, empty weekday schedules, mandatory weekly-total tasks, invalid dates, and out-of-range values.

### `/calendar` — history

- Shows a month grid, status for past/today/future dates, current and longest streak, success-day count, completion rate, and successful days this month.
- Calendar date cells show the mandatory-task completion percentage (or a dash when neutral/future); hover or keyboard focus reveals scheduled task completion details.
- User can change months; future dates cannot be selected.
- Selecting a day loads that day's tasks. Editable selected dates follow the same backdate limit as Tasks.
- Calendar refreshes visible data approximately every five seconds and after online/foreground transitions.

### `/insights` — trends

- Supports Day, Week, Month, or Custom date ranges.
- Custom range is limited to 366 days and must have valid ordered dates.
- Grouping can be automatic or Day/Week/Month.
- Shows task completion totals/rates, mandatory and extra rates, current/longest streaks, consistency, best weekday when enough observations exist, and trend/category charts.
- Chart rendering is dynamically loaded on the client; the Recharts-dependent component disables SSR.

### `/friends` — aggregate leaderboard

- Lists active, non-revoked accounts that opted into leaderboard visibility.
- Rank order: current streak, 30-day consistency, successful days, longest streak, earlier join date, then stable ID.
- The response intentionally excludes account IDs, credential emails, task titles, and individual daily logs. Only aggregate values, display name, image, and rank are returned.

### `/settings` — personal preferences and export

- User can change display name, IANA timezone, first day of week, leaderboard visibility, and theme.
- On the first dashboard visit, `TimezoneSync` attempts to save the browser's IANA timezone if the user has not selected a timezone. Saving settings is available through the normal form/API.
- Theme is handled by `next-themes`.
- “Export my data” downloads a JSON file containing the user's task definitions and progress logs.
- Push reminders are enabled/disabled per browser/device. Each phone/browser needs its own opt-in.
- Installation hints are shown for iPhone (Safari > Share > Add to Home Screen) and Android (Chrome > Install app).

### `/admin` — account administration

- Admin creates accounts using a username and temporary password.
- Account rows show active/revoked status and role.
- Revoke removes all DB sessions for the account; restore clears its revocation timestamp.
- Admin actions update the local list after a successful response rather than requiring a full page reload.

## Core task and streak rules

These are important invariants. Update both this section and `src/lib/domain/` tests if behavior changes.

- Dates used for task records are local calendar dates in `YYYY-MM-DD` form, not instants. `todayIn()` derives “today” using each user's IANA timezone.
- Weekday numbering is ISO: Monday = 1 through Sunday = 7.
- A task version applies on or after its `effectiveFrom` until a later version takes effect. Tasks are inactive before `startDate` and on/after `archivedOn`.
- Daily tasks can be scheduled every day or only on selected weekdays.
- Weekly-total tasks contribute progress over the user's configured week (Monday- or Sunday-start); they are excluded from daily completion totals and streak eligibility.
- A day is:
  - `FUTURE` after today.
  - `NEUTRAL` when no mandatory daily task is scheduled.
  - `SUCCESS` when every scheduled mandatory daily task is complete.
  - `PENDING` for today when mandatory tasks remain; today's unfinished tasks do not break a streak.
  - `FAILED` for a past day with an unfinished mandatory daily task.
- Neutral and pending days neither extend nor break streaks. Success extends a consecutive run; failed days break it.
- Streaks are determined by mandatory daily tasks only. Extra tasks do not affect streak status.
- Progress writes set the absolute value for `(task, localDate)` and are idempotent. Setting zero deletes the log row.
- A progress write requires the task to belong to the authenticated user and to be scheduled on that date. It rejects future dates and dates earlier than today minus seven days.

Calculation implementation: `src/lib/domain/dates.ts`, `schedule.ts`, `streaks.ts`, `analytics.ts`, and `ranking.ts`.

## Cross-device synchronization and responsiveness

- Task progress is written to PostgreSQL by `PUT /api/tasks/[id]/progress`.
- `/tasks` subscribes to owner-filtered Supabase Postgres Changes for `INSERT` and `UPDATE` on `TaskLog` and `Task`. Events trigger a debounced `GET /api/today`; the server remains the source of truth for the refreshed view.
- The client obtains a short-lived Supabase-compatible JWT from `GET /api/realtime-token`. The route authenticates the Better Auth session and signs a JWT with `SUPABASE_JWT_SECRET`, setting the current user ID as `sub` and the role as `authenticated`. The JWT secret is server-only and must never be exposed as a `NEXT_PUBLIC_` variable.
- RLS SELECT policies on `Task` and `TaskLog` permit Realtime access only where the row's `"userId"` matches `auth.uid()`. The public anon key alone cannot read those rows; it is only the project's client key.
- Supabase Postgres Changes cannot safely filter DELETE events by owner. To avoid leaking other users' deleted row IDs, migration `0005_realtime_task_sync` uses a private per-user Broadcast containing only a generic change signal for deletes. The client joins only its `user:<userId>` topic, protected by a `realtime.messages` SELECT policy.
- Local task changes remain optimistic and reconcile after successful writes. Input focus and in-flight writes still prevent a refresh from overwriting local interaction.
- Calendar continues to poll its current month/selected day about every five seconds while visible and online; this phase replaces polling only on `/tasks`.
- Tasks also refresh when the browser returns online/foreground, covering missed events while disconnected. Realtime status and server error details are logged to the browser console and shown in the Tasks screen. While the subscription is disconnected, a 30-second fallback refresh keeps data reasonably current; this stops after Realtime reconnects.
- Dashboard route changes have a shared loading skeleton in `src/app/(dashboard)/loading.tsx`.

## PWA and offline behavior

- Web app manifest is served by `src/app/manifest.ts`; icons are under `public/icons/`.
- `src/components/Providers.tsx` registers `public/sw.js` in production.
- The service worker caches only public static assets and the offline page. It deliberately does not cache `/api/*` responses or authenticated HTML, to avoid showing one user's private data to another.
- Offline navigation may show `/offline`; writes and authenticated data require a network.
- The worker handles `push` events by displaying notifications and opens `/tasks` on notification click.
- iPhone push generally requires a supported iOS version, installation to the Home Screen, and the user's notification permission; permission and subscription are per device.

## Push reminder flow

### User opt-in

1. In production, a supported browser registers the service worker and the user opens Settings.
2. The user clicks “Enable on this device” and grants notification permission.
3. The app fetches the public VAPID key from `GET /api/me/push-subscriptions`, creates/reuses a browser PushSubscription, and POSTs its endpoint and cryptographic keys.
4. The server associates it with the signed-in user. Endpoints must be HTTPS and match a supported push-service host. A subscription already owned by another user cannot be claimed.
5. Disabling deletes the current user's server-side subscription and unsubscribes that browser.

### Scheduled delivery

1. Inngest synchronizes with GET/POST/PUT /api/inngest, which registers the functions in src/inngest/functions.ts.
2. schedule-task-reminders runs once per minute, looks up active provisioned users with settings and push subscriptions, and queues notification.send events during the first five minutes of 9 PM, 10 PM, or 11 PM in each user's timezone.
3. Event IDs are deterministic per user/local date/hour, reducing duplicate fan-out during the five-minute window. send-task-reminder reloads the account, confirms it remains active and the event's local hour has not passed (so retries can finish during that hour), and skips it when no scheduled tasks remain.
4. Each enabled device receives a notification with the remaining count and time before midnight. ReminderDelivery's unique device/local date/hour key prevents duplicate delivery. Expired push endpoints (404/410) are removed.
5. Transient push failures remove the delivery marker and throw so Inngest retries the worker (up to five retries). The unique key lets successful devices be skipped on retry while failed devices are retried.
6. Revoked or invalid accounts are skipped. Existing push subscriptions remain stored after an account is revoked; restoring access can make them eligible again.

Inngest account registration, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, local development, and VAPID setup are documented in DEPLOY.md. The old Supabase pg_cron/pg_net integration and /api/cron/reminders endpoint have been removed.

## API reference

Routes using the shared app `route()` wrapper set private/no-store response headers. Most use the envelope `{ "data": ... }`; known errors use `{ "error": { "code", "message", "fields" } }`. The health route returns no-store directly, and Better Auth owns its `/api/auth/*` routes. Mutating app routes require same-origin requests in addition to session authorization.

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | DB `SELECT 1` check for uptime/keepalive; returns no user data. |
| `/api/auth/[...all]` | Better Auth | Sign in/out and session/auth operations. |
| `GET /api/me` | Signed-in user | Profile and safe settings projection. |
| `GET /api/realtime-token` | Signed-in user | Issue a short-lived Supabase Realtime JWT bound to the current Better Auth user. |
| `PATCH /api/me/settings` | Signed-in user | Update timezone, week start, display name, leaderboard opt-in. |
| `GET /api/today?date=YYYY-MM-DD` | Signed-in user | Daily task view; date defaults to user's local today. |
| `GET /api/tasks` | Signed-in user | List own tasks and current rule versions. |
| `POST /api/tasks` | Signed-in user | Create a task. |
| `PATCH /api/tasks/:id` | Signed-in owner | Update task, version its result rules, or archive it. |
| `DELETE /api/tasks/:id` | Signed-in owner | Delete a task only when it has no progress history. |
| `PUT /api/tasks/:id/progress` | Signed-in owner | Set absolute progress for a valid date. |
| `GET /api/calendar?month=YYYY-MM` | Signed-in user | Calendar day statuses and streak summary. |
| `GET /api/calendar/:date` | Signed-in user | Selected day view. |
| `GET /api/streaks` | Signed-in user | Streak summary. |
| `GET /api/insights` | Signed-in user | Range/group-based metrics and chart series. |
| `GET /api/leaderboard` | Signed-in user | Safe aggregate leaderboard. |
| `GET /api/export` | Signed-in user | Own task definitions and logs. |
| `GET /api/admin/accounts` | Admin | List provisioned accounts. |
| `POST /api/admin/accounts` | Admin | Create a provisioned account. |
| `DELETE /api/admin/accounts/:username` | Admin | Revoke account and delete its sessions. |
| `POST /api/admin/accounts/:username` | Admin | Restore a revoked account. |
| `GET /api/me/push-subscriptions` | Public key only | Return the VAPID public key; no user subscription data. |
| `POST /api/me/push-subscriptions` | Signed-in user | Register/update this user's device subscription. |
| `DELETE /api/me/push-subscriptions` | Signed-in user | Remove this user's device subscription. |
| `GET/POST/PUT /api/inngest` | Inngest signature | Register functions and receive scheduled/event invocations. |

Implementation for validation and route wrappers: `src/lib/validation.ts`, `src/lib/api.ts`, and `src/app/api/`.

## Data model

See `prisma/schema.prisma` and forward-only SQL files in `prisma/migrations/`.

- `User`: Better Auth identity, optional unique username, and relations to owned data.
- `Session`, `Account`, `Verification`: Better Auth persistence, including credential password hash in `Account`.
- `Organization`, `Member`, and `Invitation`: workspace-level tenancy model. A user becomes active only when they belong to an organization and have an assigned role such as `member`, `admin`, or `owner`.
- `UserSettings`: timezone, timezone initialization flag, week start, public display name, leaderboard visibility.
- `Task`: stable task identity and cosmetic fields, owner, start/archive dates, order.
- `TaskVersion`: effective-dated recurrence, mandatory status, completion type, target, unit, weekdays.
- `TaskLog`: absolute progress value for a task/local date.
- `PushSubscription`: one Web Push endpoint and key set per enabled device, linked to a user.
- `ReminderDelivery`: unique device/date/hour claim for dispatch deduplication.

Database foreign keys cascade user deletion. SQL migrations add task/log checks and enable RLS. Migration `0006_user_scoped_rls` grants the PostgreSQL `authenticated` role only the required application-table privileges and installs owner policies for `User`, `UserSettings`, `Task`, `TaskVersion`, `TaskLog`, `PushSubscription`, and `ReminderDelivery`. User-facing reads/writes execute inside an interactive transaction that uses `SET LOCAL ROLE authenticated` and transaction-local `request.jwt.claims` for the Better Auth user ID, so the role and claims cannot leak across pooled connections. The scoped Prisma client extension is private; user code should call `withUserDb`, not raw model methods. Explicit `systemDb` calls bypass this boundary and are limited to required global/system operations; review them carefully. Do not access private application tables directly from client-side Supabase/PostgREST code.

Task/statistics repositories use explicit Prisma `select` projections for UI and export data, including nested task versions and task logs, to avoid transferring unused columns through the database connection.

## Configuration and operations

### Environment variable names

Configure actual values in a local ignored `.env` or the hosting provider's secret manager. Never commit actual values.

- Database/auth: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- Realtime: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` (server-only).
- RLS-scoped app queries require the Supabase PostgreSQL connection role to be allowed to `SET LOCAL ROLE authenticated`; the runtime helper handles this inside each transaction.
- Initial admin seeding: `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`.
- Reminders: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
- Vercel supplies deployment URL variables used to construct trusted auth origins (`VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL`).
- GitHub backup workflow secrets: `APP_URL` and `BACKUP_DB_URL`.

`prisma.config.ts` uses `DIRECT_URL` for migration operations. The runtime Prisma adapter uses `DATABASE_URL`.

### Local development

1. Install Node dependencies: `npm install`.
2. Configure local database/auth variables without committing them.
3. Apply checked-in migrations to the selected database: `npx prisma migrate deploy`.
4. Seed the initial admin when needed: `npm run db:seed`.
5. Start Next.js: `npm run dev`.

Use `npm run db:migrate` when changing the Prisma schema locally; review and commit the generated migration. Do not use database reset on a database with data to preserve.

### Vercel/Supabase deployment

- Deployment setup is documented in `DEPLOY.md`.
- The package `build` script runs `prisma generate`, `prisma migrate deploy`, and `next build`; deployment therefore needs reachable database credentials and applies pending migrations.
- Set Vercel variables for the appropriate deployment environments and redeploy after changing them.
- Admin seeding is a separate command using production-safe database configuration; the hosting build does not automatically seed credentials.
- Push reminders require VAPID configuration and a registered Inngest app configured with `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
- Database migration `0006_user_scoped_rls` must be applied before the scoped data path is deployed; standard `npm run build` applies migrations. The runtime database role must be able to switch locally to PostgreSQL role `authenticated`.

### GitHub scheduled workflow

`.github/workflows/keepalive-and-backup.yml` pings `/api/health` periodically and runs a weekly `pg_dump` backup, uploaded as a GitHub Actions artifact with 30-day retention. It is not the minute-level reminder scheduler.

## Development commands and verification

| Command | What it does |
|---|---|
| `npm run dev` | Start local Next.js development server. |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`). |
| `npm test` | Run domain tests with Vitest. |
| `npx prisma validate` | Validate Prisma schema/configuration. |
| `npx prisma generate` | Regenerate the generated Prisma client. |
| `npm run db:migrate` | Create/apply a development migration. |
| `npx prisma migrate deploy` | Apply committed migrations to the configured database. |
| `npx next build` | Build Next.js without running the package script's migration step. |
| `npm run build` | Generate Prisma client, deploy migrations, then build Next.js. |

Domain unit tests cover scheduling, streaks, analytics, ranking, and reminder-time rules. There are no comprehensive browser E2E or database integration tests in the current test suite; test real authentication/DB/push deployment flows separately in a safe environment.

## Where to make changes

| Concern | Main files |
|---|---|
| Root metadata, Vercel Analytics | `src/app/layout.tsx` |
| Dashboard navigation/layout/loading | `src/app/(dashboard)/layout.tsx`, `src/components/Nav.tsx`, `src/app/(dashboard)/loading.tsx` |
| Authentication/session/authorization | `src/lib/auth/`, `src/lib/auth/session.ts`, `src/app/api/auth/[...all]/route.ts` |
| API wrapper and request validation | `src/lib/api.ts`, `src/lib/validation.ts`, `src/app/api/` |
| Task CRUD and progress | `src/server/services/tasks.ts`, `src/server/repositories/tasks.ts`, `src/features/tasks/` |
| Date/schedule/streak logic | `src/lib/domain/dates.ts`, `schedule.ts`, `streaks.ts` |
| Calendar/insights/ranking | `src/server/services/stats.ts`, `src/lib/domain/analytics.ts`, `ranking.ts`, `src/features/calendar/`, `src/features/insights/` |
| Accounts/admin | `src/server/services/admin.ts`, `src/features/admin/`, `src/app/api/admin/accounts/` |
| Settings/timezone/export | `src/server/services/me.ts`, `src/features/settings/`, `src/components/TimezoneSync.tsx` |
| Push subscriptions/reminder dispatch | `src/lib/domain/reminders.ts`, `src/server/services/reminders.ts`, `src/inngest/`, `src/features/settings/PushReminderToggle.tsx`, `src/app/api/me/push-subscriptions/`, `src/app/api/inngest/`, `public/sw.js` |
| Realtime task synchronization | `src/lib/supabase.ts`, `src/app/api/realtime-token/route.ts`, `src/features/tasks/TasksScreen.tsx`, `prisma/migrations/0005_realtime_task_sync/migration.sql` |
| User-scoped database access/RLS | `src/lib/db.ts`, `prisma/migrations/0006_user_scoped_rls/migration.sql`, `src/server/repositories/tasks.ts` |
| Database schema and evolution | `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` |
| Hosting/scheduler instructions | `DEPLOY.md`, `.github/workflows/keepalive-and-backup.yml` |

## Security and privacy expectations

- Never put credentials, auth secrets, private VAPID keys, Inngest signing keys, or real `.env` content in documentation, commits, screenshots, logs, or prompts to third-party tools.
- Keep account/task/progress queries scoped by authenticated user ID. Any endpoint taking a task ID must verify ownership server-side.
- Keep each user-scoped database operation inside `withUserDb`; the claims use transaction-local settings and are invalid outside that transaction. Never interpolate a user ID into raw SQL.
- Keep `systemDb` use explicit and limited to the documented server/system workflows. Its connection is intentionally privileged and bypasses RLS.
- Realtime JWTs must be minted only after checking the Better Auth session and the active organization membership. Keep `SUPABASE_JWT_SECRET` server-only; preserve own-row SELECT policies and private-channel topic authorization.
- Do not subscribe to unfiltered Postgres DELETE changes. Supabase cannot safely filter DELETE payloads by owner; use the private owner-scoped delete Broadcast or another equally scoped mechanism.
- Tenant-owned table queries must use `withUserDb(user.id, tx => ...)`. Keep `systemDb` usage explicit and limited to authentication, provisioning/admin, global aggregate, and background scheduler work; never replace the user wrapper with a standalone `set_config` call outside the query transaction.
- If Realtime fails, keep the full Supabase subscription error visible in the browser console and provide a low-frequency fallback refresh rather than silently leaving the task screen stale.
- `JwtSignatureError: Failed to validate JWT signature` means the deployed Supabase Realtime service rejected the token signed by the server; verify `SUPABASE_JWT_SECRET` matches the correct Supabase project's active Realtime-compatible JWT signing configuration, then redeploy.
- If the token signature is accepted but the private topic is denied, verify the Realtime publication includes `Task` and `TaskLog` and that the policies from `0005_realtime_task_sync` were applied.
- Preserve the organization membership check at sign-in and on protected requests so revoked or banned users stay blocked.
- Do not expose emails, user IDs, task titles, or detailed logs through the Friends/leaderboard response.
- Do not cache authenticated HTML or API data in the service worker.
- Keep scheduler routes secret-protected and do not test them with a production secret unless intentionally triggering real dispatch.
- Add a forward-only migration for schema changes. Never edit an already-applied production migration or reset a production database.

## Known limitations to keep in mind

- Cross-device task updates on `/tasks` use Realtime events and debounced server revalidation; Calendar still uses five-second polling.
- Push reminders depend on browser/OS notification support, permission, PWA installation on iPhone, valid VAPID configuration, and the external Supabase scheduler. A subscription opt-in by itself does not schedule server jobs.
- The Settings page marks its reminder toggle as available only in production because service worker registration is production-only.
- Current tests are unit tests for domain rules, not a full integration suite.
- `npm run build` applies migrations as part of the build command; do not run it against an unintended database.
