# Routine Tracker — Project Guide

This document is the maintained, high-level reference for the app's purpose, user flows, rules, architecture, and operations. It is intended to give a developer or AI coding assistant enough context to work on the project without guessing.

**Maintenance rule for future changes:** when changing user-visible behavior, business rules, API routes, data models, authentication, deployment, or scheduled jobs, update the relevant sections of this guide in the same change. Re-read the implementation and make the guide match the code; code is authoritative if this document ever disagrees. Update the “Guide checked” date below. Do not copy secrets, real account credentials, or `.env` values into this file.

**Guide checked:** 2026-11-10

## What the app does

Routine is a private, installable daily habit/routine tracker for a small group. An administrator provisions accounts. Members record daily or weekly task progress, review their history and trends, optionally share aggregate streak statistics on a friends leaderboard, and can enable device-specific push reminders.

The app is not a public self-registration service. It uses username/password credentials; Google sign-in is not part of the current sign-in flow. The UI is responsive and installable as a PWA. Task changes are stored in PostgreSQL and can be seen on other open devices through periodic refresh.

## Stack and runtime

- Next.js 16 App Router, React 19, TypeScript (strict mode).
- Tailwind CSS 4 and shared UI components under `src/components/`.
- Better Auth with the username plugin and a Prisma adapter.
- Prisma 7 with the PostgreSQL driver adapter; Supabase Postgres is the deployment database.
- Vercel hosts the Next.js app and Vercel Analytics is mounted in the root layout.
- Web Push (`web-push`) and a service worker deliver optional reminders.
- Vitest tests pure domain rules in `tests/domain.test.ts`.

### Request/data flow

1. A route or server page calls `requireUser()` / `pageUser()` to authenticate and confirm that the account is still allowed.
2. API route handlers use the shared `route()` wrapper in `src/lib/api.ts`. It applies same-origin checks to mutations, validates request data with Zod, returns private/no-store JSON, and translates known `ApiError`s into client responses.
3. Route handlers call server services under `src/server/services/`.
4. Services use Prisma (`src/lib/db.ts`) directly or use `src/server/repositories/tasks.ts` to load user-scoped task definitions and logs.
5. Date/schedule/streak/analytics calculations live in mostly pure functions under `src/lib/domain/`.
6. Server-rendered page components pass initial data to interactive client screens under `src/features/`. Client screens use `src/lib/fetcher.ts` for API calls.

## User roles and account lifecycle

### Member

- Can sign in, manage their own tasks and progress, inspect calendar/insights, adjust settings, export their own task data, and opt into push reminders.
- Appears on Friends only when “Show me on the friends leaderboard” is enabled.

### Admin

- Has member capabilities plus access to `/admin`.
- Can create a username/password account, revoke access, and restore access.
- The account creation API supports a role, defaulting to `MEMBER`; the current admin screen creates member accounts.
- An administrator cannot revoke their own account through the UI/API.

### Sign-in and authorization

1. Admin creates/provisions an account. Public sign-up is disabled in Better Auth.
2. The account username is normalized to lowercase and mapped internally to a synthetic email ending in `@users.routine.invalid`. This is an internal Better Auth identifier, not a user-provided email address.
3. Passwords are hashed by Better Auth's password utility and stored in its credential account record; plaintext passwords are not stored.
4. Better Auth creates a database-backed session after checking that the matching `AllowedEmail` record is active.
5. Protected server requests re-check the session and active allowlist record. A revoked user is denied; revocation also deletes their sessions.
6. Unauthenticated page visits go to `/login`; an account without active access goes to `/access-denied`.
7. Sign-out calls Better Auth and returns the user to `/login`.

Important auth implementation: `src/lib/auth/auth.ts`, `src/lib/auth/credentials.ts`, `src/lib/auth/session.ts`, `src/app/(auth)/login/page.tsx`, and `src/server/services/admin.ts`.

## Screens and user journeys

### `/` — entry

Redirects to `/tasks`; page authorization then sends a signed-out user to `/login`.

### `/tasks` — daily routine

- Server loads today's view using the user's saved timezone.
- Shows the day greeting/date, task progress, current streak, and Mandatory/Extra sections.
- User can create, edit, archive, or delete a task, and mark progress.
- Boolean tasks toggle complete/incomplete. Measurable tasks accept a numeric value. Weekly-total tasks accumulate progress over the configured week.
- Optimistic UI updates progress immediately; a failed write restores the previous value and displays an error.
- This screen refreshes from the server about every five seconds while visible and online, and refreshes when the browser returns online/foreground.
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
- User can change months; future dates cannot be selected.
- Selecting a day loads that day's tasks. Editable selected dates follow the same backdate limit as Tasks.
- Calendar refreshes visible data approximately every five seconds and after online/foreground transitions.

### `/insights` — trends

- Supports Day, Week, Month, or Custom date ranges.
- Custom range is limited to 366 days and must have valid ordered dates.
- Grouping can be automatic or Day/Week/Month.
- Shows task completion totals/rates, mandatory and extra rates, current/longest streaks, consistency, best weekday when enough observations exist, and trend/category charts.
- Chart rendering is dynamically loaded on the client.

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
- Tasks and Calendar screens poll their API data every five seconds when the tab is visible and the browser is online. They also refresh on foreground/online transitions.
- Polling is skipped during local writes, while an input is being edited, or while another refresh is in flight. Local edits are optimistic and reconciled with server data after successful writes.
- This is periodic polling/eventual consistency, not a realtime database subscription or WebSocket. A backgrounded/offline device updates when it comes online or becomes visible.
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

1. Supabase `pg_cron` invokes `POST /api/cron/reminders` once per minute via `pg_net`.
2. The route checks `Authorization: Bearer …` against `REMINDER_CRON_SECRET` using a timing-safe comparison. The exact configured route is **`/api/cron/reminders`** (not `/api/reminders`). Never put a real bearer token in shell history, chat, source control, or screenshots.
3. The service checks each account's saved timezone and only matches 9 PM, 10 PM, or 11 PM during the first five minutes of that local hour. This allows for minor scheduler delays.
4. It loads the user's day view and skips delivery if there are no unfinished task entries. It sends a notification with remaining count and hours before midnight to each enabled device.
5. A unique delivery record per device/local date/hour prevents duplicate sends from overlapping scheduler calls. Expired push endpoints (404/410) are removed. A transient delivery error removes the delivery marker so a later scheduler attempt can retry.
6. Revoked or invalid accounts are skipped. Existing push subscriptions remain stored after an account is revoked; restore can make them eligible again.

Scheduler and VAPID setup steps are in `DEPLOY.md`. Required Vercel settings are named there; this guide intentionally contains no secret values.

## API reference

Routes using the shared app `route()` wrapper set private/no-store response headers. Most use the envelope `{ "data": ... }`; known errors use `{ "error": { "code", "message", "fields" } }`. The health route returns no-store directly, and Better Auth owns its `/api/auth/*` routes. Mutating app routes require same-origin requests in addition to session authorization.

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | DB `SELECT 1` check for uptime/keepalive; returns no user data. |
| `/api/auth/[...all]` | Better Auth | Sign in/out and session/auth operations. |
| `GET /api/me` | Signed-in user | Profile and safe settings projection. |
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
| `POST /api/cron/reminders` | Scheduler secret | Run reminder dispatch; should only be called by the configured scheduler. |

Implementation for validation and route wrappers: `src/lib/validation.ts`, `src/lib/api.ts`, and `src/app/api/`.

## Data model

See `prisma/schema.prisma` and forward-only SQL files in `prisma/migrations/`.

- `User`: Better Auth identity, optional unique username, and relations to owned data.
- `Session`, `Account`, `Verification`: Better Auth persistence, including credential password hash in `Account`.
- `AllowedEmail`: legacy model name retained in the schema; for this app it is the account allowlist/role/revocation record keyed by the synthetic credential email.
- `UserSettings`: timezone, timezone initialization flag, week start, public display name, leaderboard visibility.
- `Task`: stable task identity and cosmetic fields, owner, start/archive dates, order.
- `TaskVersion`: effective-dated recurrence, mandatory status, completion type, target, unit, weekdays.
- `TaskLog`: absolute progress value for a task/local date.
- `PushSubscription`: one Web Push endpoint and key set per enabled device, linked to a user.
- `ReminderDelivery`: unique device/date/hour claim for dispatch deduplication.

Database foreign keys cascade user deletion. SQL migrations additionally add task/log checks and enable deny-all RLS for app tables because Prisma connects through a privileged server-side connection. Do not access private application tables directly from client-side Supabase/PostgREST code.

## Configuration and operations

### Environment variable names

Configure actual values in a local ignored `.env` or the hosting provider's secret manager. Never commit actual values.

- Database/auth: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- Initial admin seeding: `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`.
- Reminders: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `REMINDER_CRON_SECRET`.
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
- Push reminders require VAPID configuration plus Supabase `pg_cron`, `pg_net`, Vault secrets, and a cron job. A working endpoint without correct scheduler secrets returns 401/503 rather than sending.

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
| Push subscriptions/reminder dispatch | `src/lib/domain/reminders.ts`, `src/server/services/reminders.ts`, `src/features/settings/PushReminderToggle.tsx`, `src/app/api/me/push-subscriptions/`, `src/app/api/cron/reminders/`, `public/sw.js` |
| Database schema and evolution | `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` |
| Hosting/scheduler instructions | `DEPLOY.md`, `.github/workflows/keepalive-and-backup.yml` |

## Security and privacy expectations

- Never put credentials, auth secrets, private VAPID keys, cron bearer tokens, or real `.env` content in documentation, commits, screenshots, logs, or prompts to third-party tools.
- Keep account/task/progress queries scoped by authenticated user ID. Any endpoint taking a task ID must verify ownership server-side.
- Preserve the allowlist check at sign-in and on protected requests so revocation remains effective.
- Do not expose emails, user IDs, task titles, or detailed logs through the Friends/leaderboard response.
- Do not cache authenticated HTML or API data in the service worker.
- Keep scheduler routes secret-protected and do not test them with a production secret unless intentionally triggering real dispatch.
- Add a forward-only migration for schema changes. Never edit an already-applied production migration or reset a production database.

## Known limitations to keep in mind

- Cross-device task updates use five-second polling, not instantaneous push/realtime synchronization.
- Push reminders depend on browser/OS notification support, permission, PWA installation on iPhone, valid VAPID configuration, and the external Supabase scheduler. A subscription opt-in by itself does not schedule server jobs.
- The Settings page marks its reminder toggle as available only in production because service worker registration is production-only.
- Current tests are unit tests for domain rules, not a full integration suite.
- `npm run build` applies migrations as part of the build command; do not run it against an unintended database.
