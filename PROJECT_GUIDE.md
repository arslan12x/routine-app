# Routine Tracker — Project Guide

This document is the maintained, high-level reference for the app's purpose, user flows, rules, architecture, and operations. It is intended to give a developer or AI coding assistant enough context to work on the project without guessing.

**Maintenance rule for future changes:** when changing user-visible behavior, business rules, API routes, data models, authentication, deployment, or scheduled jobs, update the relevant sections of this guide in the same change. Re-read the implementation and make the guide match the code; code is authoritative if this document ever disagrees. Update the “Guide checked” date below. Do not copy secrets, real account credentials, or `.env` values into this file.

**Guide checked:** 2026-11-20

## Start here (including for IDE coding assistants)

This guide is the project handoff. A coding assistant receiving it should read the whole guide, inspect the actual repository before changing code, treat code and migrations as authoritative when details differ, preserve existing user data and privacy boundaries, and run the narrowest relevant checks plus `npm run typecheck` and `npm test` for cross-cutting changes. Never print or copy `.env` values. Do not apply a database migration, reset a database, deploy, or change production data unless explicitly asked. Update this guide when behavior, setup, data models, or operations change.

The app is a Next.js habit tracker with individual private task/progress data, organization membership, friendship leaderboard, AI-guided learning, offline progress sync, cross-device task updates, and optional push reminders. It is not a blank starter: inspect existing services/components and reuse their patterns rather than duplicating features.

### Prerequisites

- macOS, Linux, or Windows with a terminal and Git.
- Node.js 22 LTS (Node 20.9+ is the Next.js minimum) and npm.
- A Supabase PostgreSQL project for app data. For local feature work, use a development/test Supabase project rather than a production database.
- A Better Auth secret and stable local base URL (`http://localhost:3000`).
- Optional by feature: Google Gemini API key for AI study; Supabase Realtime credentials for cross-device events; VAPID keys and Inngest account for web-push reminders.
- Install packages from the committed lockfile with `npm ci` for a clean install or `npm install` when changing dependencies.

### Quick start

1. Clone the repository and enter its root directory.
2. Run `npm ci`.
3. Create an ignored local `.env` file (never commit it) using the variable names in [Configuration and operations](#configuration-and-operations). Set `DATABASE_URL` to the Supabase transaction-pooler connection and `DIRECT_URL` to the session-pooler/direct migration connection. Set `BETTER_AUTH_URL=http://localhost:3000` and generate a unique `BETTER_AUTH_SECRET` (for example, `openssl rand -base64 32`).
4. Confirm `DIRECT_URL` points to a disposable development database before applying migrations. Run `npx prisma migrate deploy`.
5. Set `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD` in local `.env`, then run `npm run db:seed`. Seeding creates/updates the initial platform admin in `routine-workspace`; it resets that seeded account's password to the configured value.
6. Run `npm run dev`, then open `http://localhost:3000` and sign in with the seeded credentials.
7. For feature work, use `npm run typecheck`, `npm test`, `npx prisma validate`, and `npx next build`. `npm run build` also applies pending database migrations, so avoid using it against a database unless that migration is intended.

Do not run `prisma migrate reset` or `db push` against a database containing data you need. Schema changes must use reviewed, forward-only SQL migrations committed in `prisma/migrations/`.

### Coding assistant operating rules

- First locate the relevant API route, service, repository, UI, schema, migration, and existing tests; follow an existing end-to-end feature to understand conventions.
- Keep each user's routine tasks and progress private even when they share an organization. Workspace membership scopes administration and friend discovery, not task visibility.
- Use `withUserDb(user.id, tx => ...)` for authenticated user-owned database reads/writes. `systemDb` bypasses RLS and is reserved for authentication, platform/workspace administration, global aggregate reads, and background jobs.
- Put server authorization in the route/service; UI hiding is not authorization. Validate request bodies and preserve same-origin checks for mutations.
- Never add phases/features not requested, rewrite migrations already applied to live databases, or hide failed operations behind success-shaped fallbacks.
- Keep Gemini prompts server-side; treat user-authored course briefs as untrusted input.
- For UI changes, preserve keyboard interaction, responsive layouts, reduced-motion behavior, and existing Tailwind design tokens.

## What the app does

Routine is a private, installable daily habit/routine tracker with isolated organization workspaces. Workspace owners/admins provision members, who record their own daily or weekly task progress, review history and trends, optionally share aggregate streak statistics on a friends leaderboard, and can enable device-specific push reminders.

The app is not a public self-registration service. It uses username/password credentials and optional workspace-configured SAML SSO. The UI is responsive and installable as a PWA. Task changes are stored in PostgreSQL and synchronized to other open `/tasks` screens using Supabase Realtime.

## Stack and runtime

- Next.js 16 App Router, React 19, TypeScript (strict mode).
- Tailwind CSS 4 and shared UI components under `src/components/`.
- Sonner provides app-wide toast feedback; Capacitor Haptics provides light impact feedback in native builds.
- Capacitor Local Notifications (`@capacitor/local-notifications`) and Web Audio chime alert users when Pomodoro study sprints end.
- Native Health integration (Apple HealthKit on iOS & Health Connect on Android) auto-syncs steps and workout minutes for Measurable fitness tasks.
- Workspace Team Challenges aggregate participating members' daily task logs into real-time organization-wide progress bars.
- IndexedDB via `idb-keyval` caches the daily task view and stores user-scoped offline progress mutations with ISO timestamps for Last-Write-Wins (LWW) reconnect sync.
- Better Auth with the username plugin and a Prisma adapter.
- Prisma 7 with the PostgreSQL driver adapter; Supabase Postgres is the deployment database.
- Supabase JS Realtime client for owner-scoped live updates in Tasks.
- Inngest schedules and runs retryable background workers for push reminders, weekly AI coach reviews, Duolingo sync, and job follow-up transitions.
- Vercel hosts the Next.js app and Vercel Analytics is mounted in the root layout.
- Sentry (`@sentry/nextjs`) captures React Suspense crashes, 500 API errors, and failed background retries.
- Google Generative AI (`@ai-sdk/google`) powers AI study tutoring, blog series curriculum, smart push reminders, and candidate job application email drafting via `gemini-3.5-flash-lite`. Stderr deprecation warnings are silenced with `process.env.AI_SDK_LOG_WARNINGS = "false"` to keep Vercel runtime logs clean.
- Resend API HTTP transport delivers candidate job application emails to recruiters with automatic candidate BCC copies; falls back gracefully to deterministic simulation (MOCK mode) when API keys are absent.
- Web Push (`web-push`) and a service worker (`public/sw.js`, `routine-static-v3`) deliver optional reminders and enforce a **Network-First** strategy for Next.js static assets (`/_next/static/`), preventing stale client-side chunk caching on redeployment.
- Hardened Content Security Policy (`next.config.ts`) explicitly whitelists Vercel manifests (`manifest-src 'self' https://vercel.com https://*.vercel.com`), live connections (`connect-src ... https://vercel.live https://*.vercel.app https://vercel.com`), and verified novel cover domains (`img-src ... https://covers.openlibrary.org https://upload.wikimedia.org`).
- Vitest tests pure domain rules in `tests/domain.test.ts` (67 unit tests covering scheduling, streaks, analytics, ranking, achievements, novels, learning memory, skipped day penalties, finance, and the 4-stage job pipeline).
- Playwright runs foundational E2E authentication and dashboard tests in `tests/e2e/`.

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
- Platform admins can provision an isolated workspace with its first owner account.
- Can create a username/password account with a real email, revoke access, and restore access within their workspace.
- Can configure one SAML 2.0 provider for the workspace and review the latest 100 append-only administrative audit entries.
- Account administration and audit queries are filtered by the current organization membership; tasks and progress remain private to each user.
- An administrator cannot revoke their own account through the UI/API.

### Sign-in and authorization

1. An admin creates/provisions an account with a username, real email address, and temporary password. Public sign-up is disabled in Better Auth.
2. The account is inserted into the `User` table and assigned a `Member` record in the administrator's current workspace. A newly provisioned workspace starts with its own owner account; membership remains one workspace per user.
3. Sign-in accepts a username or email with a password, or a configured organization email with SAML SSO. SSO does not provision new accounts: it links only an existing, verified account whose membership and email domain match the configured provider.
4. Organization membership roles (`owner`, `admin`, `member`) are distinct from Better Auth global roles. Workspace-scoped app authorization uses the active membership. Only the global Better Auth `admin` role is a platform-admin role; ordinary workspace admins do not receive it and cannot see another workspace's data. SSO provider registration through the generic Better Auth endpoint is disabled in favor of the workspace-admin API.
5. Passwords are hashed by Better Auth's password utility and stored in the credential account record; plaintext passwords are not stored.
6. Protected server requests re-check the session and the user's active organization membership. A banned or revoked user is denied; revocation deletes their sessions.
7. Unauthenticated page visits go to `/login`; an account without active workspace membership goes to `/access-denied`.
8. Sign-out calls Better Auth and returns the user to `/login`.

Important auth implementation: `src/lib/auth/auth.ts`, `src/lib/auth/session.ts`, `src/app/(auth)/login/page.tsx`, `src/server/services/admin.ts`, and `prisma/schema.prisma`.

### Enterprise migration path

The app has moved away from the legacy synthetic-email allowlist model toward an organization-scoped workspace model. Existing accounts are joined to the default `routine-workspace` organization via a `Member` row; admins can provision additional organizations and an initial owner through `/admin`. The `Member.userId` uniqueness constraint intentionally limits each account to one workspace. The `organization` and `admin` Better Auth plugins enforce workspace membership and role checks, while `systemDb` is reserved for trusted account/workspace administration and `withUserDb()` is used for user-scoped database access.

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
- Task completion type can be changed from the editor; the new rule is effective today, preserving past task history.
- Boolean tasks toggle complete/incomplete. Measurable tasks accept a numeric value. Weekly-total tasks accumulate progress over the configured week.
- Native Health Auto-Sync (Apple HealthKit & Health Connect) can auto-sync steps and workout minutes for Measurable tasks on mount and in the background. A "Sync Health" button in the dashboard header triggers an immediate sync.
- AI-guided tasks can use any supported completion type or recurrence and are tied to DSA, FDA (Forward Deployed Engineering), Java, System Design, or a custom course. A passing session completes a scheduled Boolean/measurable task; weekly-total tasks count one successful study session toward their weekly target. A custom course stores a name and learner-provided brief that shapes a progressive roadmap and daily lessons. Tapping the completion control opens the study chat instead of changing progress optimistically or queuing an offline mutation. Once enabled, the AI gate cannot be removed.
- **Deterministic Learner Memory (`getTaskLearningContext`):** Solves LLM amnesia across sessions by pre-calculating historical progress from `TaskLog`: unique completed days, current learning streak, and curriculum stage (`Day X+1`, `Module Math.floor(X/5) + 1`). This is injected directly into Gemini's `SYSTEM_CONTEXT`. If 0 completed days exist, it defaults to a Day 1 Onboarding Course (Foundations at absolute zero).
- **Skipped Day Consistency Penalty:** In AI-guided study tasks, if a user skips any scheduled study day, their consecutive study streak is broken and the system enforces a strict consistency penalty. The learner is punished for inconsistency by requiring a minimum of **10 to 15 intense practice exercises/questions** covering previous topics before any new lesson content for the current day is unlocked.
- **Duolingo Task Auto-Sync:** For habit tasks linked to language learning, the Tasks screen provides integration with the Duolingo API (`POST /api/integrations/duolingo/sync`). When synced, it verifies `xpGainedToday` in the user's timezone and automatically marks the linked task complete in `TaskLog`.
- The study chat is a full-screen interface with Markdown/GFM rendering, Mermaid diagrams, and an integrated 25-minute native Pomodoro focus timer (`PomodoroTimer.tsx`). When the sprint finishes, it fires a Capacitor Local Notification and plays a chime to prompt taking a 5-minute break.
- Standard task-progress mutations reject AI-gated tasks. Database RLS also blocks normal authenticated clients from inserting, updating, or deleting AI-task progress; only the server's study-completion transaction carries the private transaction-local completion claim. AI study requires a network connection; chat sessions are not persisted and cannot be completed offline.
- Task completion updates optimistically without a spinner and triggers light haptics on supported native platforms. Progress writes run in the background in per-task order; failures restore the prior value and show an error toast.
- Completing every mandatory task for today triggers a confetti reward, success toast, and success haptic on supported native platforms. The reward fires once per day and does not trigger for an initially completed screen or historical dates.
- The latest daily task view is cached per account in IndexedDB. Progress changes made offline are queued per account and replayed in order when the browser emits its `online` event.
- This screen listens for owner-scoped database events and refreshes from the server when an event arrives. It also refreshes when the browser returns online/foreground to cover missed events.
- Past days can be opened via Calendar; task progress can be edited today and for the preceding seven days. Older dates and future dates are read-only/not editable.
- Weekly AI Routine Coach: A card appears directly below the daily progress ring featuring a personalized 2-3 sentence weekly review and a practical, high-impact actionable tip for the upcoming week, generated by an Inngest cron job running Sunday nights that feeds the past 7 days of logs into Gemini (`gemini-3.5-flash-lite`).

Main implementation: `src/app/(dashboard)/tasks/page.tsx`, `src/features/tasks/TasksScreen.tsx`, `TaskDialog.tsx`, `DayTasks.tsx`, `src/server/ai/coach.ts`, and `src/server/services/tasks.ts`.

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

### `/insights/[userId]` — friend insights

- Dynamic route displaying shareable habit, streak, and consistency metrics for a specified friend.
- Protected by an authorization guard: accessible only by the user themselves or an accepted friend (`403 Forbidden` for non-friends).
- Strictly displays aggregate habit completions, streaks, and category breakdowns without exposing private task titles or financial data.

### `/novels` — public-domain reading module

- Allows users to search and filter free public-domain novels by genre (Fiction, Mystery, Science Fiction, Gothic, Adventure, Romance, Philosophy).
- Integrates with the Gutendex (Project Gutenberg) and Open Library APIs with local catalog seeding and fallback.
- Clicking "Read Free Now" logs the user's reading session as `READING` and opens the verified safe reading URL in a new tab (`target="_blank" rel="noopener noreferrer"`).
- All redirect URLs are strictly verified against an allowlist of safe public-domain hosts (`gutenberg.org`, `openlibrary.org`, `archive.org`, `standardebooks.org`, `en.wikisource.org`).
- Users can view their active and completed reading sessions and toggle their completion status.

### `/blogs` — multi-day AI blog content generator

- Allows users to plan and generate multi-day, publication-ready technical blog curriculums with seamless narrative continuity.
- **Curriculum Planning (Step 1):** Users specify topic, total duration (e.g. 5, 10, or 30 days), tone (Technical / Deep Dive, Conversational, Academic, Practical / Tutorial), and target audience. Gemini generates an exact, non-overlapping sequential syllabus where each day focuses on a distinct subtopic.
- **Content Generation (Step 2):** Users generate full GitHub-flavored Markdown for individual days. Each day's generation includes previous day context to ensure narrative cohesion and zero redundant explanations.
- **Interactive Workbench:** Day-by-day interactive timeline tabs, live rendered Markdown preview, inline raw Markdown editor, one-click clipboard copy, and regeneration actions.

### `/finance` — high-security financial budgeting & expenditure tracker

- Isolated personal finance and expenditure management system protected by PostgreSQL Row-Level Security (`FinanceBudget` and `FinanceExpense`).
- **Privacy Blur Mode:** Instant header toggle (`Eye` / `EyeOff`) masks all balances and monetary figures with CSS blur (`blur-md`), preventing shoulder-surfing in public environments.
- **Budget-vs-Actual Tracking:** Monthly limits per category with real-time progress bars and visual threshold alerts (<80% emerald green, 80-99% amber warning, >=100% rose over-budget).
- **Expense Logging & CSV Statement Importer:** Manual transaction entry modal alongside a CSV statement drag-and-drop / paste importer with intelligent merchant keyword inference (Whole Foods → Groceries, Uber → Transport, Netflix → Entertainment, Starbucks → Dining).
- **Zero Leakage Security Guarantee:** Financial data is strictly private and never joined, queried, or displayed in Friend Insights, Leaderboards, or Team Challenges.

### `/jobs` — candidate job application engine & 4-stage follow-up pipeline

- End-to-end job outreach and scheduled follow-up pipeline designed exclusively for candidates applying to companies (not posting job openings).
- **Candidate Readiness Toolbar (Spacious 3-Column Layout):**
  1. *Sender Email (`Reply-To`):* Configurable candidate email address. Applications carry this as `Reply-To` so recruiter replies reach the candidate's personal inbox directly.
  2. *Resume Document Gate (`UserResume`):* Mandatory document upload (`.pdf`, `.doc`, `.docx`, `.txt`). Candidates cannot apply without a resume. Extracted technical skills are parsed into keyword badges. Resumes are stored isolated per user.
  3. *Candidate Experience Level:* Persistent tier selector (`FRESHER` 0-1 yrs, `JUNIOR` 1-3 yrs, `MID` 3-5 yrs, `SENIOR` 5+ yrs) stored in `UserIntegration` (`CANDIDATE_JOB_PROFILE`). Automatically adapts job role curation and AI pitch tone.
- **7 Target Company Categories (Balanced 4-Column Responsive Grid):**
  1. *Start-up Companies* (`STARTUP`)
  2. *Big MNCs* (`BIG_MNC`)
  3. *Big Sharks* (`BIG_SHARKS`)
  4. *Actively Hiring* (`ACTIVELY_HIRING`)
  5. *Mid-Market MNCs* (`MID_MNC`)
  6. *Small-Scale & Consulting Agencies* (`SMALL_SCALE`)
  7. *Foreign & Remote International Companies* (`FOREIGN`)
- **⚡ 2-Day Batch Refresh for ALL Channels:** Every 2 days, fresh active hiring openings across ALL 7 categories rotate into the Apply stage (`TO_APPLY`), listing at least 30-35+ curated opportunities tailored to the candidate's experience tier.
- **4-Stage Follow-Up State Machine with Time Locks:**
  - *Stage 1 (`TO_APPLY`):* Initial application. On dispatch, transitions to `WAITING_FU1` with `nextActionAt = appliedAt + 4 days`.
  - *Stage 2 (`FOLLOW_UP_1`):* Surfaces after 4 days. **4-Day Time Lock:** While waiting, the application shows a `Locked (4d)` countdown badge with disabled action buttons. Unlocks only after 4 days. On dispatch, transitions to `WAITING_FU2` with `nextActionAt = appliedAt + 10 days`.
  - *Stage 3 (`FOLLOW_UP_2`):* Surfaces 10 days after initial application. **10-Day Time Lock:** Button remains disabled until Day 10. On dispatch, transitions to `WAITING_FU3` with `nextActionAt = appliedAt + 15 days`.
  - *Stage 4 (`FOLLOW_UP_3`):* Final polite check-in surfacing 15 days after initial application. On dispatch, archives application into `CLOSED`.
  - *HR Response Short-Circuit:* Logging a recruiter reply (`POST /api/jobs/applications/:id/reply`) immediately sets stage to `REPLIED` and clears `nextActionAt`, permanently halting further follow-ups.
- **AI Email Drafter & Dispatch Drawer:**
  - Drafts distinct, non-repetitive email copy customized to candidate experience level and stage.
  - Interactive drawer allows live review and editing of subject and pitch.
  - **Live Resend Dispatch vs. Mock Mode:** When `RESEND_API_KEY` is configured, dispatches real emails via Resend HTTP API and automatically sends a candidate BCC copy for personal record-keeping; falls back gracefully to deterministic MOCK simulation when unconfigured.

### `/challenges` — workspace team challenges

- Real-time collective goals for the active organization workspace (e.g., walking 1,000,000 steps together or completing 300 workout minutes).
- Individual task logs of enrolled workspace members within the challenge's date window automatically aggregate into a real-time progress bar.
- Shows target, total progress, percentage completion, days remaining, participant count, and top 5 contributors (safe public display names only).
- Members can launch new team challenges, join active challenges, or leave challenges.

### `/friends` — private friends and leaderboard

- The Leaderboard tab shows the current user and accepted friends who opted into leaderboard visibility. Better Auth global admins can see all opted-in workspace members.
- Add Friends lists active workspace accounts with safe profile fields only; emails and authentication data are never returned.
- Requests shows incoming requests with Accept and Decline actions. Declining deletes the pending request, so the sender can request again later.
- Rank order: current streak, 30-day consistency, successful days, longest streak, earlier join date, then stable ID.
- Milestone Badges: Permanently unlocked achievements (`Achievement` model, such as 7-day streak, 30-day master, 10 and 100 AI study sessions, 100 completed tasks, flawless week) are evaluated and displayed alongside player rows as icon pills with hover descriptions.
- Leaderboard responses intentionally exclude account IDs, credential emails, task titles, and individual daily logs. Only aggregate values, display name, image, unlocked badges, and rank are returned.

### `/settings` — personal preferences and export

- User can change display name, IANA timezone, first day of week, leaderboard visibility, and theme.
- On the first dashboard visit, `TimezoneSync` attempts to save the browser's IANA timezone if the user has not selected a timezone. Saving settings is available through the normal form/API.
- Theme is handled by `next-themes`.
- “Export my data” downloads a JSON file containing the user's task definitions and progress logs.
- **Duolingo Account Integration:** Dedicated settings card where users can link their external Duolingo account by username. The backend queries the Duolingo public user API, verifies account existence, stores the integration in `UserIntegration` (`provider: DUOLINGO`), and surfaces current streak and daily XP.
- Push reminders are enabled/disabled per browser/device. Each phone/browser needs its own opt-in.
- Apple Health & Health Connect auto-sync can be enabled/disabled to automatically sync steps and workout minutes with Measurable tasks in the background.
- Installation hints are shown for iPhone (Safari > Share > Add to Home Screen) and Android (Chrome > Install app).

### `/admin` — account administration

- Admin creates accounts using a username, real email, and temporary password. Account creation, revocation, restoration, and SSO provider changes are recorded with actor, workspace, target, action, and safe metadata.
- Platform admins can create a separate organization with a first owner account; that owner then administers their own workspace and provisions its members.
- Account rows show active/revoked status and role. Account queries and mutations are restricted to the admin's workspace.
- Revoke removes all DB sessions for the account; restore clears its revocation flag. An administrator cannot revoke their own account.
- SAML setup accepts IdP metadata XML and email domain; the app derives its SP entity ID. The UI provides the app's SP metadata URL. Removing/replacing a provider must be done through the workspace admin API; direct Better Auth provider mutation endpoints are blocked.
- The audit trail shows the latest 100 administrative actions. `AuditLog` rows are protected by workspace-aware RLS and database triggers that reject updates, deletes, and truncation.

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
- Offline progress mutations are queued in IndexedDB via `idb-keyval` with an ISO `updatedAt` client timestamp. When returning online, mutations are replayed in order.
- Last-Write-Wins (LWW) conflict resolution prevents stale offline mutations from overriding newer online writes (e.g. mobile offline vs. desktop online): the server compares the incoming timestamp with `TaskLog.updatedAt` and rejects stale writes with a 409 `CONFLICT`. The client drops the stale mutation and continues syncing remaining items.
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
4. Context-Aware Smart Reminders: Prior to dispatch, the push reminder worker evaluates remaining tasks, mandatory tasks, streak count, and hours remaining. When configured, it calls Gemini (`gemini-3.5-flash-lite`) with a 4-second timeout to synthesize a personalized, punchy 1-sentence reminder message (under 120 characters). If the Gemini key is absent or generation fails, it falls back deterministically to the standard remaining count and hours left message.
5. Each enabled device receives a notification with the contextual message. ReminderDelivery's unique device/local date/hour key prevents duplicate delivery. Expired push endpoints (404/410) are removed.
6. Transient push failures remove the delivery marker and throw so Inngest retries the worker (up to five retries). The unique key lets successful devices be skipped on retry while failed devices are retried.
7. Revoked or invalid accounts are skipped. Existing push subscriptions remain stored after an account is revoked; restoring access can make them eligible again.

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
| `PUT /api/tasks/:id/progress` | Signed-in owner | Set absolute progress for a valid date; supports LWW conflict evaluation with ISO `updatedAt`. |
| `GET /api/tasks/:id/learning-context` | Signed-in owner | Calculate deterministic learner memory (completed days, active streak, module, skipped day consistency penalty flag and question count). |
| `POST /api/ai/study` | Signed-in owner | Stream the subject-specific study chat; the server-only completion tool records progress only for the authenticated user's scheduled AI-gated task. |
| `GET /api/calendar?month=YYYY-MM` | Signed-in user | Calendar day statuses and streak summary. |
| `GET /api/calendar/:date` | Signed-in user | Selected day view. |
| `GET /api/streaks` | Signed-in user | Streak summary. |
| `GET /api/insights` | Signed-in user | Range/group-based metrics and chart series. |
| `GET /api/users/:userId/insights` | Signed-in user | View shareable habit, streak, and completion metrics for self or accepted friends (`403 Forbidden` for non-friends). |
| `GET /api/challenges` | Signed-in user | List organization team challenges with progress bars, participant counts, and top contributors. |
| `POST /api/challenges` | Signed-in user | Create a new organization-wide team challenge with target, unit, and date range. |
| `POST /api/challenges/:id/join` | Signed-in user | Enroll current user into a workspace team challenge. |
| `GET /api/leaderboard` | Signed-in user | Safe aggregate leaderboard for self and accepted friends; Better Auth global admins see all opted-in workspace members. |
| `GET /api/friends/discover` | Signed-in user | Safe workspace profile list, friendship states, and incoming requests. |
| `POST /api/friends/requests` | Signed-in user | Send a pending friend request by user ID. |
| `PUT /api/friends/requests/:userId` | Signed-in user | Accept or decline the pending request from that user. Decline removes the request. |
| `GET /api/novels` | Public / User | Search and list free public-domain novels by genre or query with user reading session status. |
| `POST /api/novels/:id/session` | Signed-in user | Log/update a novel reading session (`READING` or `COMPLETED`) with safe public-domain host domain validation. |
| `GET /api/novels/sessions` | Signed-in user | List the signed-in user's active and completed novel reading sessions. |
| `GET /api/coach/latest` | Signed-in user | Retrieve the latest weekly AI coach review and high-impact routine tip. |
| `GET /api/integrations/duolingo` | Signed-in user | Fetch active Duolingo integration status, username, streak, and last sync timestamp. |
| `POST /api/integrations/duolingo/sync` | Signed-in user | Verify external Duolingo profile via public API, update streak and XP, and auto-complete linked tasks. |
| `GET /api/blogs` | Signed-in user | List the signed-in user's multi-day AI blog generation plans. |
| `POST /api/blogs/plan` | Signed-in user | Step 1: Create a multi-day blog plan and generate an exact sequential outline via Gemini. |
| `GET /api/blogs/:planId` | Signed-in user | Retrieve a blog plan and its daily syllabus contents. |
| `POST /api/blogs/:planId/generate-day/:dayNumber` | Signed-in user | Step 2: Generate publication-ready GitHub-flavored Markdown for a specific day using previous-day context. |
| `PATCH /api/blogs/:planId/days/:dayNumber` | Signed-in user | Update/edit the generated markdown content for a specific day. |
| `GET /api/finance/summary` | Signed-in user | Financial overview: total monthly spend, budget limits, category breakdown, and alerts. |
| `GET /api/finance/budgets` | Signed-in user | Retrieve active monthly category budgets. |
| `POST /api/finance/budgets` | Signed-in user | Create or update a monthly category budget limit. |
| `GET /api/finance/expenses` | Signed-in user | List recent user expenses with optional category and date filtering. |
| `POST /api/finance/expenses` | Signed-in user | Log a new personal expenditure. |
| `DELETE /api/finance/expenses/:id` | Signed-in user | Delete an expense entry owned by the signed-in user. |
| `POST /api/finance/import` | Signed-in user | Import CSV bank/credit statements with automatic keyword-based category inference. |
| `GET /api/jobs/profile` | Signed-in user | Retrieve candidate job outreach profile (sender email, experience level, experience years). |
| `PUT /api/jobs/profile` | Signed-in user | Update candidate job outreach profile (sender email, experience tier). |
| `GET /api/jobs/resume` | Signed-in user | Retrieve parsed resume metadata and detected skill badges. |
| `POST /api/jobs/resume` | Signed-in user | Upload and parse candidate resume document (`.pdf`, `.doc`, `.docx`, `.txt`), extracting skills into JSON. |
| `GET /api/jobs/companies` | Signed-in user | List curated companies across the 7 categories. |
| `POST /api/jobs/refresh` | Signed-in user | ⚡ 2-Day Batch Refresh: Rotate active hiring openings across ALL 7 channels into the Apply stage (`TO_APPLY`). |
| `GET /api/jobs/applications` | Signed-in user | List candidate job applications with stage filtering, stage counters, and locked timers. |
| `POST /api/jobs/applications` | Signed-in user | Queue a new job application for outreach. |
| `GET /api/jobs/applications/:id/draft` | Signed-in user | Generate or retrieve AI-drafted email pitch tailored to candidate experience and pipeline stage. |
| `POST /api/jobs/applications/:id/apply` | Signed-in user | Dispatch initial application email; sets `appliedAt`, moves to `WAITING_FU1` with 4-day lock, and triggers candidate BCC copy. |
| `POST /api/jobs/applications/:id/follow-up` | Signed-in user | Dispatch scheduled follow-up email when lock window elapses; advances pipeline to next waiting stage. |
| `POST /api/jobs/applications/:id/reply` | Signed-in user | Record recruiter reply; short-circuits application to `REPLIED` and halts further follow-up triggers. |
| `PATCH /api/jobs/applications/:id/auto-send` | Signed-in user | Toggle automatic background follow-up dispatch for an application. |
| `GET /api/export` | Signed-in user | Own task definitions and logs. |
| `GET /api/admin/accounts` | Admin | List provisioned accounts. |
| `POST /api/admin/accounts` | Admin | Create a provisioned account. |
| `DELETE /api/admin/accounts/:username` | Admin | Revoke account and delete its sessions. |
| `POST /api/admin/accounts/:username` | Admin | Restore a revoked account. |
| `POST /api/admin/workspaces` | Platform admin | Create a separate organization and its initial owner account. |
| `GET /api/admin/sso` | Admin | List this workspace's SAML provider metadata. |
| `POST /api/admin/sso` | Admin | Register a SAML 2.0 provider for this workspace. |
| `DELETE /api/admin/sso/:id` | Admin | Remove this workspace's SAML provider. |
| `GET /api/admin/audit` | Admin | Read the latest 100 immutable audit entries for this workspace. |
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
- `AuditLog`: immutable workspace-scoped administration history. RLS uses a narrowly scoped security-definer membership check because the `Member` table itself has no authenticated-role read policy; the authenticated role cannot update, delete, or truncate audit rows.
- `ssoProvider`: Better Auth SAML/OIDC provider persistence. Phase 1 exposes SAML registration/removal only through workspace-admin APIs; SSO resolution requires an existing verified account in the provider's workspace and email domain.
- `UserSettings`: timezone, timezone initialization flag, week start, public display name, leaderboard visibility.
- `Friendship`: directed pending request or accepted connection; user-facing relationship queries and mutations use `withUserDb()` and participant- plus workspace-scoped RLS policies.
- `Task`: stable task identity and cosmetic fields, owner, start/archive dates, order.
- AI study settings on `Task`: `isAiGated`, nullable `aiSubject` (`DSA`, `FDA`, `JAVA`, `SYSTEM_DESIGN`, or `CUSTOM`), plus optional custom course name/learning brief. Custom briefs are treated as learner-provided course context, not system instructions. A database constraint keeps these fields consistent, and a trigger prevents removing an enabled gate.
- `TaskVersion`: effective-dated recurrence, mandatory status, completion type, target, unit, weekdays.
- `TaskLog`: absolute progress value for a task/local date.
- `PushSubscription`: one Web Push endpoint and key set per enabled device, linked to a user.
- `ReminderDelivery`: unique device/date/hour claim for dispatch deduplication.
- `Challenge`: organization-scoped collective goal with target, unit, category, and date range.
- `ChallengeParticipant`: enrollment mapping linking a member to a challenge. Migration `0015_workspace_team_challenges` protects challenge data with workspace-scoped RLS.
- `Achievement`: permanently unlocked milestones (e.g. `STREAK_7`, `STREAK_30`, `AI_SESSIONS_10`, `AI_SESSIONS_100`, `TASK_CENTURY`, `PERFECT_WEEK`, `FIRST_STEP`). Unique by `[userId, badgeType]`.
- `CoachReview`: weekly AI routine performance reviews and actionable tips generated by Sunday night Inngest cron using Gemini (`gemini-3.5-flash-lite`). Unique by `[userId, weekStartDate]`.
- `NovelCatalog`: public-domain novel metadata (externalId, title, author, genre, coverUrl, readUrl, description, language).
- `UserReadingSession`: user reading progress on cataloged novels (`READING` | `COMPLETED`, startedAt, lastReadAt, completedAt). Unique by `[userId, novelId]`.
- `BlogPlan`: multi-day AI blog generation series (`userId`, `topic`, `totalDays`, `tone`, `targetAudience`).
- `BlogDayContent`: sequential syllabus day item (`planId`, `dayNumber`, `title`, `subtopicsJson`, `markdownContent`, `status`). Unique by `[planId, dayNumber]`.
- `UserIntegration`: external service and profile mappings (`userId`, `provider`, `externalUsername`, `lastSyncedAt`, `lastStatus`, `metadata`). Unique by `[userId, provider]`. Powers Duolingo streak/XP verification (`provider: DUOLINGO`) and candidate outreach profile persistence (`provider: CANDIDATE_JOB_PROFILE` storing experience level, years, and sender email).
- `FinanceBudget`: monthly category expenditure budget limits (`userId`, `category`, `monthlyLimit`, `currency`, `monthYear`). Unique by `[userId, category, monthYear]`.
- `FinanceExpense`: personal expenditure records (`userId`, `amount`, `category`, `description`, `spentAt`, `paymentMethod`).
- `UserResume`: candidate resume document metadata and extracted technical skills (`userId`, `fileUrl`, `parsedText`, `skillsJson`). Unique by `userId`.
- `Company`: curated outreach opportunities (`name`, `category`, `hrEmail`, `websiteUrl`, `location`, `description`, `lastRefreshedAt`). Categorized into 7 channels: `STARTUP`, `BIG_MNC`, `BIG_SHARKS`, `ACTIVELY_HIRING`, `MID_MNC`, `SMALL_SCALE`, `FOREIGN`.
- `JobApplication`: candidate job application pipeline state machine (`userId`, `companyId`, `jobTitle`, `jobUrl`, `hrEmail`, `stage`, `appliedAt`, `nextActionAt`, `emailThreadId`, `autoSend`, `logs`). Unique by `[userId, companyId, jobTitle]`. Stages include `TO_APPLY`, `WAITING_FU1`, `FOLLOW_UP_1`, `WAITING_FU2`, `FOLLOW_UP_2`, `WAITING_FU3`, `FOLLOW_UP_3`, `REPLIED`, and `CLOSED`.

Database foreign keys cascade user deletion. SQL migrations add task/log checks and enable RLS. Migration `0006_user_scoped_rls` grants the PostgreSQL `authenticated` role only the required application-table privileges and installs owner policies for `User`, `UserSettings`, `Task`, `TaskVersion`, `TaskLog`, `PushSubscription`, and `ReminderDelivery`. Migration `0008_friendships` scopes friendship reads to either participant, inserts to the requester, and acceptance/deletion to the addressee; it also prevents friendship identity fields from changing. Migration `0012_phase_one_audit_sso` adds workspace-scoped immutable audit records and SSO provider persistence, with RLS policies and server-only mutations. Migration `0013_workspace_friend_isolation` limits discoverable profiles, friendships, and friend requests to members of the same workspace. Migration `0009_ai_gated_study` ensures regular authenticated clients cannot directly write logs for AI-gated tasks; a dedicated server-only scoped transaction sets the claim required for validated study completion. Migration `0016_phase_four_ai_and_achievements` adds `Achievement` and `CoachReview` models with owner RLS policies for `authenticated` users and server background workers. Migration `0017_novel_reading_module` adds `NovelCatalog` and `UserReadingSession` with public catalog read access and user-scoped session RLS policies. Migrations `0018_phase_five_ai_blogs_and_integrations` and `0019_phase_six_and_seven_finance_and_jobs` introduce `BlogPlan`, `BlogDayContent`, `UserIntegration`, `FinanceBudget`, `FinanceExpense`, `UserResume`, `Company`, and `JobApplication` with strict owner-scoped RLS policies ensuring complete data isolation. User-facing reads/writes execute inside an interactive transaction that uses `SET LOCAL ROLE authenticated` and transaction-local `request.jwt.claims` for the Better Auth user ID, so the role and claims cannot leak across pooled connections. The scoped Prisma client extension is private; user code should call `withUserDb`, not raw model methods. Explicit `systemDb` calls bypass this boundary and are limited to required global/system operations; review them carefully. Do not access private application tables directly from client-side Supabase/PostgREST code.

Task/statistics repositories use explicit Prisma `select` projections for UI and export data, including nested task versions and task logs, to avoid transferring unused columns through the database connection.

## Configuration and operations

### Environment variable names

Configure actual values in a local ignored `.env` or the hosting provider's secret manager. Never commit actual values.

- **Required for normal local app operation:** `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`.
- **Required for cross-device Realtime task updates:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` (server-only).
- RLS-scoped app queries require the Supabase PostgreSQL connection role to be allowed to `SET LOCAL ROLE authenticated`; the runtime helper handles this inside each transaction.
- **AI-guided study, coaching & blogs:** `GOOGLE_GENERATIVE_AI_API_KEY` (server-only Gemini API key). AI SDK deprecation notices are silenced globally with `AI_SDK_LOG_WARNINGS=false` to prevent cluttering server logs.
- **Job outreach email dispatch:** `RESEND_API_KEY` (server-only Resend API key for live recruiter email dispatch with candidate BCC copies). `JOB_DISPATCH_FROM_EMAIL` (verified sender address, e.g. `onboarding@resend.dev` or custom domain). When `RESEND_API_KEY` is omitted, the application operates in deterministic simulated MOCK mode.
- **Web Push reminders:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`. Generate VAPID keys with `npx web-push generate-vapid-keys`. Inngest keys are needed only when registering/running scheduled reminders.
- Vercel supplies deployment URL variables used to construct trusted auth origins (`VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL`).
- **GitHub keepalive/backup workflow only:** `APP_URL` and `BACKUP_DB_URL`.

`prisma.config.ts` uses `DIRECT_URL` for migration operations. The runtime Prisma adapter uses `DATABASE_URL`.

The repository does not include a committed `.env.example` because connection URLs and integration settings vary by environment. Create `.env` locally and add the listed names with your own development values. Keep all non-`NEXT_PUBLIC_` credentials server-only; never put service-role keys, database passwords, Better Auth secrets, Gemini keys, JWT signing secrets, or private VAPID/Inngest keys in browser code.

### Local development

1. Install Node dependencies: `npm install`.
2. Configure local database/auth variables without committing them.
3. Apply checked-in migrations to the selected database: `npx prisma migrate deploy`.
4. Seed the initial admin when needed: `npm run db:seed` (uses `DIRECT_URL`; re-running resets the seeded admin password).
5. Start Next.js: `npm run dev`, then open `http://localhost:3000`.

Use `npm run db:migrate` when changing the Prisma schema locally; review and commit the generated migration. Do not use database reset on a database with data to preserve.

### Vercel/Supabase deployment

- Deployment setup is documented in `DEPLOY.md`.
- The package `build` script runs `prisma generate`, `prisma migrate deploy`, and `next build`; deployment therefore needs reachable database credentials and applies pending migrations.
- Confirm the deployment's build log includes `prisma migrate deploy` and says all migrations are applied. If Vercel's Build Command was overridden to `next build`, migrations do not run automatically; apply pending migrations through the approved deployment workflow before using code that depends on the new tables/columns.
- Set Vercel variables for the appropriate deployment environments and redeploy after changing them.
- Admin seeding is a separate command using production-safe database configuration; the hosting build does not automatically seed credentials.
- Push reminders require VAPID configuration and a registered Inngest app configured with `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
- Database migration `0006_user_scoped_rls` must be applied before the scoped data path is deployed; standard `npm run build` applies migrations. The runtime database role must be able to switch locally to PostgreSQL role `authenticated`.
- Never execute a migration SQL file manually in Supabase SQL Editor and then run `prisma migrate deploy` without reconciling migration history; Prisma will still consider an unrecorded migration pending and can attempt duplicate DDL. If SQL was already applied manually, inspect `_prisma_migrations` and schema state and use a reviewed Prisma migration-resolution procedure rather than blindly rerunning SQL.

### Admin SSO and audit troubleshooting

- The admin screen loads accounts, SSO providers, and audit history independently. A failed SSO request should not prevent the other sections from rendering.
- The Prisma model `SsoProvider` maps to the PostgreSQL table `"SsoProvider"` (capital S). Migration `0012_phase_one_audit_sso` must use that exact quoted identifier. Earlier/manual SQL created `"ssoProvider"` (lowercase s), which makes Prisma queries fail with a missing-relation error and caused the observed `/api/admin/sso` 500. Migration `0014_sso_provider_table_case` renames the legacy table safely. Confirm both migrations have applied to the same Supabase project used by `DATABASE_URL`.
- `/api/admin/sso` and `/api/admin/audit` return 503 `MIGRATION_REQUIRED` for known missing table/column Prisma errors. Check the Vercel Function log for other server failures; the browser's generic 500 response is not enough to determine them. Do not paste database URLs or credentials into chat.
- The SQL snapshot shared during support is not the deployment source of truth. Do not execute a copied migration a second time; reconcile schema state and Prisma migration history first. The migration `0014` handles the known lower-case SSO table by renaming it, and deliberately errors if neither or both table names exist.
- The browser's generic 500 response is not enough to identify a server failure. Check the matching Vercel Function log for `/api/admin/sso` and retain the Prisma error code/message (do not share secrets or connection strings).
- Account create, revoke, restore, workspace creation, and SSO provider create/remove actions write an `AuditLog` row in the same database transaction as the change. If the change succeeded with the audit-enabled application version and schema, its audit row should exist; check `GET /api/admin/audit` and Vercel logs for the write request.
- Audit entries are not retroactively reconstructed. Accounts created before the audit-writing application version was deployed will have no `ACCOUNT_CREATED` entry. Only actual successful operations made while the audit-writing code and `0012` schema are both active are recorded.
- If an account creation succeeds but the corresponding audit row is absent, verify that the deployed `/api/admin/accounts` handler is from the current revision, its logs show the successful transaction, and the admin account/audit page is looking at the same workspace/database. Do not invent historical actor identities to backfill missing audit records.
- `ssoProvider` stores provider metadata. The login resolver only links an already-existing, email-verified member of the configured workspace whose email domain matches the provider. Configure IdP metadata with the SP metadata URL shown in `/admin`; do not share raw IdP secrets or signed assertions in support requests.

### GitHub scheduled workflow

`.github/workflows/keepalive-and-backup.yml` pings `/api/health` periodically and runs a weekly `pg_dump` backup, uploaded as a GitHub Actions artifact with 30-day retention. It is not the minute-level reminder scheduler.

## Development commands and verification

| Command | What it does |
|---|---|
| `npm run dev` | Start local Next.js development server. |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`). |
| `npm test` | Run domain tests with Vitest. |
| `npm run test:e2e` | Run Playwright end-to-end tests. |
| `npx prisma validate` | Validate Prisma schema/configuration. |
| `npx prisma generate` | Regenerate the generated Prisma client. |
| `npm run db:migrate` | Create/apply a development migration. |
| `npx prisma migrate deploy` | Apply committed migrations to the configured database. |
| `npx next build` | Build Next.js without running the package script's migration step. |
| `npm run build` | Generate Prisma client, deploy migrations, then build Next.js. |

Domain unit tests cover scheduling, streaks, analytics, ranking, reminder-time, and LWW sync rules. Playwright E2E tests in `tests/e2e/auth.spec.ts` cover authentication and task dashboard journeys.

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

## Phase 5: AI & External Sync Architecture

Phase 5 introduces deterministic AI learning memory, a skipped-day consistency penalty system, a multi-day AI blog content generation pipeline, and external integration verification via the Duolingo API.

### 1. AI Adaptive Learning Course Generator & Skipped Day Consistency Penalty
- **Deterministic Context Injection:** Querying `TaskLog` provides exact historical metrics: unique completed days, current learning streak, and curriculum stage (`Day X+1`, `Module Math.floor(X/5) + 1`).
- **Memory Fix (`getTaskLearningContext`):** Solves LLM amnesia across sessions by pre-calculating state deterministically and injecting a `SYSTEM_CONTEXT / DETERMINISTIC LEARNER MEMORY` block into the Gemini prompt (`gemini-3.5-flash-lite`).
- **Syllabus & Badging:** When `completedDays === 0`, defaults strictly to a Day 1 Onboarding Course (Foundations at absolute zero). The UI modal surfaces a `"Based on X completed days"` (or `"Day 1 Onboarding"`) badge with an active Pomodoro timer.
- **Skipped Day Consistency Penalty:**
  - When an AI-guided study task (DSA, FDA, Java, System Design, Custom) is scheduled on a date and the learner misses it, their consecutive streak is broken (`missedDays > 0`).
  - In response, `getTaskLearningContext` flags `hasConsistencyPenalty: true` and calculates `penaltyQuestionsCount` (scaling between **10 and 15 questions** based on the duration of inactivity).
  - The learner is punished for inconsistency: they must complete a set of 10 to 15 intense review exercises covering previous topics before any new lesson content for the current day is unlocked.
  - The UI study modal highlights this requirement with an amber warning banner, preventing curriculum advancement until the review exercises are completed.
- **API Endpoint:** `GET /api/tasks/[id]/learning-context`.

### 2. Multi-Day AI Blog Content Generator
- **Data Models:**
  - `BlogPlan`: `id`, `userId`, `topic`, `totalDays`, `tone`, `targetAudience`, timestamps.
  - `BlogDayContent`: `id`, `planId`, `dayNumber`, `title`, `subtopicsJson`, `markdownContent`, `status` (`PENDING` | `GENERATED`).
- **2-Step AI Pipeline:**
  - *Step 1 (`POST /api/blogs/plan`):* Divides the topic into an exact JSON outline array of length `totalDays` with sequential logical progression and no topic overlap between days.
  - *Step 2 (`POST /api/blogs/[planId]/generate-day/[dayNumber]`):* Generates comprehensive, publication-ready GitHub-flavored Markdown for that specific day, pulling in the previous day's summary to maintain narrative continuity.
- **UI Screen (`/blogs`):** Full series management with a setup form (topic, duration selector, tone, audience), day-by-day interactive timeline, Markdown viewer, live inline editor, regenerate action, and one-click clipboard copy.

### 3. Duolingo API Task Verification
- **Data Model:** `UserIntegration` (`userId`, `provider: DUOLINGO`, `externalUsername`, `lastSyncedAt`, `lastStatus`, `metadata`).
- **Verification Engine (`POST /api/integrations/duolingo/sync`):**
  - Queries Duolingo's public profile endpoint (`/2017-06-30/users?username=...`) with timeout protection.
  - Analyzes `xpGainedToday` and streak progress in the user's local timezone.
  - When verified, automatically marks the linked task complete in `TaskLog`.
  - Gracefully detects private profiles (`DISABLE_PUBLIC_PROFILE`) or rate limits (`429`), surfacing a non-blocking warning while allowing manual completion override.
- **Background Sync:** Inngest cron worker `duolingoDailySync` runs every 4 hours to verify active integrations automatically.

---

## Phase 6: High-Security Standalone Financial Budgeting & Expenditure Tracker

Phase 6 implements a strictly isolated, personal financial tracker with bank-grade security boundaries and PostgreSQL Row-Level Security.

### 1. Database & Row-Level Security (Strict Tenant Isolation)
- **Tables:**
  - `FinanceBudget`: `id`, `userId`, `category`, `monthlyLimit`, `currency`, `monthYear`, timestamps.
  - `FinanceExpense`: `id`, `userId`, `amount`, `category`, `description`, `spentAt`, `paymentMethod`, timestamps.
- **Security & RLS Policies:**
  - PostgreSQL Row-Level Security enabled on all `Finance*` tables.
  - Revoked from `PUBLIC` and `anon`; granted exclusively to `authenticated`.
  - Policies enforce `"userId" = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')` for SELECT, INSERT, UPDATE, and DELETE.
  - All server endpoints strictly derive `userId` from the verified server-side session token via `requireUser()`.
  - **Zero Leakage Guarantee:** `Finance*` tables are strictly isolated and never queried, joined, or referenced by Friend Insights, Leaderboards, or shared AI summaries.

### 2. Extensible Financial Provider Layer
- **Architecture:** Abstracted behind the `FinancialProvider` interface:
  ```typescript
  export interface FinancialProvider {
    providerId: string;
    providerName: string;
    parseTransactions(input: string | Buffer | Record<string, unknown>): Promise<NormalizedTransaction[]>;
  }
  ```
- **CSV Provider (`CsvFinancialProvider`):** Parses bank and credit card CSV exports. Features intelligent keyword-based category inference (e.g., Whole Foods → Groceries, Uber → Transport, Netflix → Entertainment, Starbucks → Dining) and currency sanitization.

### 3. Frontend Dashboard (`/finance`)
- **Privacy Blur Mode:** Instant toggle (`Eye` / `EyeOff`) that masks all balances and amounts on-screen with CSS blur, preventing shoulder surfing in public spaces.
- **Budget-vs-Actual Tracking:** Monthly progress bars by category with dynamic color thresholds (emerald for < 80%, amber for 80-99%, rose for ≥ 100% over-budget).
- **Expense Logging & Statement Import:** Quick-add modal for manual expense entries, inline category budget configuration, and CSV drag-and-drop / paste importer.

---

## Phase 7: Automated Job Application Engine & 4-Stage Shifting Follow-Up Pipeline

Phase 7 introduces an end-to-end automated job application pipeline, resume intelligence, multi-channel company categorization, experience-level curation, and a deterministic shifting follow-up timeline powered by Inngest, Gemini, and Resend.

### 1. Schema, Categorization & Candidate Experience Intelligence
- **Data Models:**
  - `UserResume`: `id`, `userId`, `fileUrl`, `parsedText`, `skillsJson`, timestamps. Isolated strictly per user.
  - `Company`: `id`, `name`, `category`, `hrEmail`, `websiteUrl`, `location`, `description`, `lastRefreshedAt`, timestamps.
  - `JobApplication`: `id`, `userId`, `companyId`, `jobTitle`, `jobUrl`, `hrEmail`, `stage`, `appliedAt`, `nextActionAt`, `emailThreadId`, `autoSend`, `logs`, timestamps.
  - `UserIntegration` (`provider: CANDIDATE_JOB_PROFILE`): stores candidate outreach settings (`email`, `experienceLevel`, `experienceYears`).
- **4 Candidate Experience Levels:**
  - `FRESHER`: 0-1 years experience. Curation highlights entry-level, graduate trainee, and associate engineer positions (e.g. Associate Software Engineer, Graduate Trainee, Junior Analyst).
  - `JUNIOR`: 1-3 years experience. Early-career engineer / developer opportunities.
  - `MID`: 3-5 years experience. Core full-stack, frontend, and backend engineering openings.
  - `SENIOR`: 5+ years experience. Senior, lead, and staff engineering and architecture positions (e.g. Lead Full-Stack Developer, Staff Infrastructure Engineer).
  - Users can inspect and change their experience level at any time from the readiness toolbar; the selected tier persists and drives subsequent job listings until updated.
  - `inferExperienceLevelFromTitle(title)` extracts candidate experience tiers from job titles with regex word boundaries.
  - `getRoleForExperience(companyName, category, level)` dynamically provisions experience-appropriate roles for any company.
- **7 Target Company Channels:**
  - `STARTUP`: Fast-growing venture-backed startups (Seed through Series C).
  - `BIG_MNC`: Global Fortune 500 enterprises (Microsoft, Oracle, Cisco).
  - `BIG_SHARKS`: Tier-1 tech giants and decacorns (Stripe, Uber, Databricks).
  - `ACTIVELY_HIRING`: Organizations with active hiring surges (Vercel, Supabase, Postman).
  - `MID_MNC`: Digital engineering leaders and mid-market innovators (EPAM, Endava).
  - `SMALL_SCALE`: Specialized boutique consultancies and engineering agencies (Thoughtbot, Formidable Labs).
  - `FOREIGN`: Distributed, remote-first international companies (GitLab, Automattic, Canonical).
- **⚡ 2-Day Batch Refresh for ALL Channels:**
  - The 2-Day Refresh feature applies across **all 7 categories**, not just startups.
  - Every 2 days, active hiring companies across all channels rotate into the Apply stage (`TO_APPLY`), listing at least 30-35+ verified opportunities.
  - The batch refresh engine (`POST /api/jobs/refresh`) utilizes a 10-second interactive Prisma transaction timeout with parallel processing to prevent database transaction timeout errors (P2028).

### 2. Candidate Outreach Gating, Sender Email & Live Resend Delivery
- **Candidate Sender Email (`Reply-To`):** Candidates configure their contact email. All outreach emails carry this address in the `Reply-To` header, ensuring recruiter responses route directly to the candidate's personal inbox.
- **Mandatory Resume Gating (`UserResume`):** Candidates cannot apply to jobs without uploading a resume document (`.pdf`, `.doc`, `.docx`, `.txt`). The parser extracts technical skills into JSON and renders them as skill badges. Resume storage is strictly isolated per candidate.
- **Live Resend Dispatch & Candidate BCC Copy:**
  - When `RESEND_API_KEY` is configured, outgoing outreach is delivered via Resend's HTTP API.
  - The dispatcher automatically includes the candidate's sender email as a **BCC recipient**, guaranteeing the candidate receives an exact copy in their personal email inbox for record-keeping.
  - When `RESEND_API_KEY` is omitted, the system falls back gracefully to deterministic MOCK simulation.
  - The interactive drawer displays a live Delivery Mode banner (`LIVE RESEND DISPATCH` vs. `MOCK MODE`).

### 3. AI Email Drafter
- Leverages the candidate's parsed resume (`parsedText`, `skillsJson`), company specifications, and candidate experience tier to draft non-repetitive pitches:
  - *Day 0 (Initial Application):* Direct application tailoring skills to company challenges with resume attachment confirmation. Pitch tone adapts to career stage (foundational speed and learning velocity for freshers; architectural scale and engineering leadership for seniors).
  - *Day 4 (Follow-Up 1):* Courteous 2-paragraph nudge acknowledging busy hiring cycles.
  - *Day 10 (Follow-Up 2):* Proactive value-add message sharing relevant architectural or technical perspectives.
  - *Day 15 (Final Follow-Up):* Professional closing check-in leaving the door open for future collaboration.
- Includes a global / per-application "Auto-Send" vs. "Review & Approve" toggle before dispatching.

### 4. 4-Stage Shifting State Machine with Strict Time Locks
- **Stage Progression:**
  - *Stage 1 (`TO_APPLY`):* Available openings. Applying stamps `appliedAt = now()`, advances the record to `WAITING_FU1`, and sets `nextActionAt = appliedAt + 4 days`.
  - *Stage 2 (`FOLLOW_UP_1`):* Surfaces 4 days after application. **4-Day Time Lock:** While waiting, the application card displays a `Locked (4d)` countdown badge with disabled action buttons. Unlocks strictly when 4 full days elapse. Dispatching advances the record to `WAITING_FU2` with `nextActionAt = appliedAt + 10 days`.
  - *Stage 3 (`FOLLOW_UP_2`):* Surfaces 10 days after initial application. **10-Day Time Lock:** Button remains disabled until Day 10. Dispatching advances to `WAITING_FU3` with `nextActionAt = appliedAt + 15 days`.
  - *Stage 4 (`FOLLOW_UP_3`):* Final polite nudge surfacing 15 days after initial application. Dispatching archives the application into `CLOSED`.
- **Immediate Reply Short-Circuiting:** Logging an HR response (`POST /api/jobs/applications/[id]/reply`) immediately transitions the application to `REPLIED` and nullifies `nextActionAt`, permanently halting further follow-up dispatches.
- **Hourly Pipeline Advancement:** Inngest cron worker `jobFollowUpScheduler` (`0 * * * *`) promotes buffer states and automatically dispatches due follow-ups when `autoSend` is enabled.

### 5. Responsive UI Architecture (`/jobs`)
- **Readiness Toolbar:** Full-width 3-column grid (`grid-cols-1 md:grid-cols-3`) providing spacious cards for Sender Email, Resume Document, and Experience Level with zero truncation.
- **Category Filter Grid:** 4-column balanced responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) accommodating all 7 channels cleanly on all viewports.
- **Pipeline Navigation:** Clean separation of Stage tabs and Experience filter pills into two dedicated rows.
- **Standardized Job Cards:** Uniform card heights with `min-h-[3rem]` title and `min-h-[2.5rem]` description baselines, maintaining pixel-perfect grid alignment across varying title lengths.
- **Interactive Email Drawer:** Live in-drawer preview, editable subject/body, one-click AI copy regeneration, delivery mode indicator, and instant dispatch.
