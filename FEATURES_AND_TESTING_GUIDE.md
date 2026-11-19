# Routine Tracker — Complete Features & End-to-End Testing Guide

This document catalogs every module and feature in the application, details the architectural business logic behind its implementation, and provides reproducible End-to-End (E2E) testing instructions.

---

## 1. Authentication, Multi-Tenancy & Enterprise Administration (Phase 1)

### 1.1 Business Logic Implementation
* **Session Management & Tenant Guard:** Handled via Better Auth (`@better-auth/sso` and `better-auth`). Sessions are validated in `src/lib/auth/session.ts` via `requireUser()`, which verifies:
  1. Active session cookie.
  2. Workspace membership (`Member` linked to `Organization`).
  3. User active status (`banned === false`).
* **Role-Based Access Control (RBAC):** Users are assigned `"ADMIN"` or `"MEMBER"`. Route handlers in `src/app/api/admin/*` enforce `user.role === "ADMIN"`.
* **Enterprise SSO (`SsoProvider`):** SAML/OIDC configuration mapping allowed email domains to an organization with SP metadata generation.
* **Immutable Audit Logging (`AuditLog`):** Any account creation, status revocation, restoration, workspace setup, or SSO provider change writes an `AuditLog` entry in the same database transaction as the operation.

### 1.2 End-to-End Testing Procedure
1. **Sign-In:** Navigate to `/login`. Sign in using seeded credentials (`admin@routine.app` or member account). Confirm redirect to `/tasks`.
2. **Access Control:** Log in as a standard member and navigate to `/admin`. Verify HTTP 403 / redirect to `/access-denied`.
3. **Audit Trail Verification:**
   - As an admin, navigate to `/admin`.
   - Create a test account or toggle user status.
   - Inspect the "Audit History" table on `/admin` and confirm the action, actor identity, target user, and UTC timestamp appear immediately.

---

## 2. Core Routine & Task Management (Phase 1 & 2)

### 2.1 Business Logic Implementation
* **Task Definition & Schedules (`Task`, `TaskVersion`, `TaskLog`):**
  - **Completion Types:** `BOOLEAN` (done = 1, incomplete = 0) vs. `MEASURABLE` (numeric progress toward `target`, e.g., 10,000 steps, 50 pages).
  - **Recurrence:** `DAILY`, `WEEKDAYS` (specific days 1-7), and `WEEKLY_TOTAL` (aggregated sum across the calendar week).
  - **History Safety:** Schema versions use `effectiveFrom`. Past task logs are immutable to subsequent target/schedule changes.
  - **Backdating Window:** Edits are restricted to today and the previous 7 days (`BACKDATE_DAYS = 7`). Future dates are rejected with 400 `FUTURE_DATE`.
* **Last-Write-Wins (LWW) Offline Sync (`shouldRejectStaleWrite`):**
  - Offline changes are queued in IndexedDB (`src/lib/offline-store.ts`).
  - Mutations attach an ISO `updatedAt` timestamp.
  - `PUT /api/tasks/[id]/progress` compares the client timestamp against the database record's `updatedAt`. If the server timestamp is newer, the mutation is rejected with 409 `CONFLICT` to prevent mobile-vs-desktop race condition overwrites.

### 2.2 End-to-End Testing Procedure
1. **Create Task:** Navigate to `/tasks`. Click "+ New Task". Create a measurable daily task (e.g., "Water Intake", target 8 glasses). Verify it renders in the active task list.
2. **Progress Logging:** Click the progress circle or enter "4". Confirm local UI updates optimistically and persists on refresh.
3. **LWW Conflict Simulation:**
   - Open DevTools Network tab and set to "Offline".
   - Modify task progress to "6".
   - In another browser tab/session, update the same task to "8" (updating server `updatedAt`).
   - Reconnect network in the first tab and trigger sync. Confirm the stale client write does not overwrite the newer server value.

---

## 3. Native Ecosystem & Collaboration (Phase 3)

### 3.1 Business Logic Implementation
* **Capacitor Native Health Sync (`src/lib/native-health.ts`):** Matches active measurable tasks by unit (`"steps"`, `"mins"`, `"minutes"`) or title (`"walk"`, `"run"`, `"workout"`). Queries Capacitor Health plugins and writes progress to `TaskLog`.
* **Native Pomodoro Timer (`PomodoroTimer.tsx`):** Built-in 25-minute sprint timer inside `StudyChatModal`. Dispatches Capacitor Local Notifications upon session completion.
* **Workspace Team Challenges (`Challenge`, `ChallengeParticipant`):**
  - Admins or members create organization-wide shared goals (e.g., "Team 1,000,000 Steps").
  - Member logs automatically aggregate into a real-time progress bar with live participation count.

### 3.2 End-to-End Testing Procedure
1. **Team Challenges:**
   - Navigate to `/challenges`. Click "Create Challenge". Set target to 500 units.
   - Join challenge as User A and User B.
   - Complete progress on a matched task; navigate back to `/challenges` and verify the unified organization progress bar increments.
2. **Pomodoro Timer:**
   - On `/tasks`, open an AI-gated task study modal.
   - Click "Start" on the Pomodoro timer in the header. Verify the 25:00 countdown initiates and can be paused or reset.

---

## 4. AI Coaching, Gamification & Reminders (Phase 4)

### 4.1 Business Logic Implementation
* **Weekly AI Routine Coach (`src/server/ai/coach.ts`):**
  - Inngest cron job (`0 21 * * 0` - Sunday 21:00 UTC) extracts the past 7 days of completion logs, streaks, and top habits.
  - Prompts Gemini `gemini-3.5-flash-lite` to generate an encouraging review and a concrete actionable tip, stored in `CoachReview`.
* **Context-Aware Smart Push Reminders (`src/server/ai/reminders.ts`):**
  - Minute-level Inngest scheduler checks user local timezones for the 9 PM, 10 PM, or 11 PM reminder slots.
  - Formats contextual data (number of remaining tasks, current streak) and calls Gemini to generate a single punchy motivational sentence before web-push dispatch.
* **Milestone Badges (`src/lib/domain/achievements.ts`):**
  - Permanently awards badges: `STREAK_7_DAYS`, `STREAK_30_DAYS`, `AI_SESSIONS_10`, `AI_SESSIONS_100`, `FLAWLESS_WEEK`.
  - Badges render on the user profile and `/insights` leaderboard.

### 4.2 End-to-End Testing Procedure
1. **Weekly Coach Review:**
   - Trigger Inngest function `weeklyRoutineCoach` or call `GET /api/coach/latest`.
   - Confirm review and actionable tip display on `/insights`.
2. **Badges:**
   - Log 7 consecutive days of completed tasks.
   - Open `/insights` and verify the "7-Day Streak" badge is permanently displayed.

---

## 5. Social Insights & Novel Reading (Standalone Modules)

### 5.1 Business Logic Implementation
* **Friend Insights Authorization Guard (`/api/users/[userId]/insights`):**
  - Allows access ONLY if `targetUserId === currentUserId` OR an `ACCEPTED` record exists in `Friendship`. Returns 403 `FORBIDDEN` otherwise.
  - Excludes all private/financial tables (`Finance*`) and returns only public habit streaks and completion rates.
* **Novel Reading Module (`src/server/services/novels.ts`):**
  - Public-domain catalog search via Gutendex API.
  - Tracks reading sessions (`UserReadingSession`: `READING`, `COMPLETED`).
  - Strict host allowlist validation (`isValidNovelRedirectUrl`) ensures users can only be redirected to verified safe public-domain repositories (`gutenberg.org`, `archive.org`, `standardebooks.org`).

### 5.2 End-to-End Testing Procedure
1. **Friend Insights Guard:**
   - As User A, attempt to access `/insights/[userB_id]` without an accepted friend request. Verify access is blocked with 403.
   - Accept friend request in `/friends`; refresh `/insights/[userB_id]` and verify public streak charts are visible.
2. **Novel Reading:**
   - Navigate to `/novels`. Search for a genre (e.g., "Fiction").
   - Click "Read Free Now" on a novel. Verify session status logs as `READING` and opens the verified Gutenberg URL in a secure new tab (`rel="noopener noreferrer"`).

---

## 6. AI Adaptive Learning & External Sync (Phase 5)

### 6.1 Business Logic Implementation
* **AI Adaptive Learning Course Memory Fix (`src/server/ai/learning-context.ts`):**
  - Queries `TaskLog` to calculate exact unique completed days for the task.
  - Injects deterministic memory into Gemini's `SYSTEM_CONTEXT` (`Day X+1`, `Module Math.floor(X/5) + 1`).
  - If 0 completed days: defaults to "Day 1 - Onboarding Course (Foundations at Zero)".
  - Displays `"Based on X completed days"` (or `"Day 1 Onboarding"`) badge in the UI modal.
* **Multi-Day AI Blog Content Generator (`src/server/services/blogs.ts`):**
  - **Step 1 (`POST /api/blogs/plan`):** Divides a topic into a sequential JSON curriculum of length `totalDays` with zero topic overlap.
  - **Step 2 (`POST /api/blogs/[planId]/generate-day/[dayNumber]`):** Generates publication-ready Markdown for that day, using yesterday's recap for narrative continuity.
* **Duolingo API Task Verification (`src/server/services/duolingo.ts`):**
  - Queries Duolingo's public endpoint (`/2017-06-30/users?username=...`).
  - Verifies `xpGainedToday` in the user's timezone; auto-marks linked Duolingo tasks complete in `TaskLog`.
  - Non-blocking fallback: if the profile is private or rate-limited, shows a non-blocking warning while allowing manual override.
  - 4-hour Inngest cron (`duolingoDailySync`) verifies all active integrations.

### 6.2 End-to-End Testing Procedure
1. **Learning Course Memory:**
   - Create an AI-gated study task ("DSA Practice").
   - Open the study modal. Verify the header shows "Day 1 Onboarding" badge.
   - Complete session (passing with score >= 80). Open modal next day; confirm header updates to "Based on 1 completed day".
2. **Blog Generator:**
   - Navigate to `/blogs`. Click "New Blog Series". Enter "PostgreSQL Internals", 5 Days, Professional tone.
   - Verify 5 timeline tabs are created. Click "Generate Content" on Day 1. Review rendered Markdown and verify copy-to-clipboard functionality.
3. **Duolingo Verification:**
   - On `/tasks`, create a task with "Duolingo" in the title.
   - Click "Refresh Sync". If completed on Duolingo today, verify task turns green/complete. If private profile, verify warning banner displays with manual override enabled.

---

## 7. High-Security Standalone Financial Tracker (Phase 6)

### 7.1 Business Logic Implementation
* **Strict Tenant Isolation & PostgreSQL RLS:**
  - Tables `FinanceBudget` and `FinanceExpense` have RLS enabled, revoked from `anon`, and granted to `authenticated` enforcing `userId = auth.uid()`.
  - All `/api/finance/*` endpoints derive `userId` strictly from the server-side session token.
  - Zero leakage guarantee: `Finance*` models are never referenced or queried by Friends, Leaderboard, or AI coach reviews.
* **Extensible Financial Provider (`FinancialProvider`):**
  - `CsvFinancialProvider` parses standard bank statements (Date, Description, Amount, Category).
  - Automatically infers categories from merchant keywords (e.g., Whole Foods → Groceries, Uber → Transport, Netflix → Entertainment, Starbucks → Dining).
* **Frontend UI (`/finance`):**
  - "Privacy Blur" toggle (`Eye` / `EyeOff`) masks all monetary figures with a CSS blur filter.
  - Monthly budget-vs-actual category progress bars with threshold colors (<80% emerald, 80-99% amber, >=100% rose).
  - Quick-add expense modal, budget limits configuration, and CSV drag-and-drop / paste importer.

### 7.2 End-to-End Testing Procedure
1. **Privacy Blur:**
   - Navigate to `/finance`. Click "Privacy Blur". Confirm all dollar amounts are obscured with `blur-md`. Click again to restore clarity.
2. **Budget Tracking & Expense Logging:**
   - Click "Set Budget" for "Groceries" with a limit of $400.
   - Click "Add Expense", log $150 for Groceries.
   - Verify category progress bar shows $150 / $400 (38% utilized) in emerald green.
3. **CSV Statement Import:**
   - Click "Import CSV". Paste:
     ```csv
     Date,Description,Amount
     2026-11-10,Whole Foods Market,85.20
     2026-11-12,Uber Trip,22.50
     ```
   - Click "Import Transactions". Confirm Whole Foods maps to Groceries and Uber maps to Transport with updated totals.

---

## 8. Automated Job Application Engine & Shifting Pipeline (Phase 7)

### 8.1 Business Logic Implementation
* **Resume Intelligence (`UserResume`):**
  - Parses uploaded text/PDF into `parsedText` and extracts core technical skills (`TypeScript`, `React`, `PostgreSQL`, `Docker`, `AWS`, etc.) into `skillsJson`.
* **7 Company Channels & 2-Day Startup Refresh:**
  - `STARTUP`, `BIG_MNC`, `BIG_SHARKS`, `ACTIVELY_HIRING`, `MID_MNC`, `SMALL_SCALE`, `FOREIGN`.
  - Inngest cron job `rotateStartupCompanies` (`0 0 */2 * *`) updates and rotates startup listings every 48 hours.
  - HR email validator (`isValidHrEmail`) checks RFC format, verified TLD, rejects disposable email providers, and deduplicates contacts.
* **AI Email Drafter (`src/server/ai/jobs.ts`):**
  - Generates distinct, non-repetitive email copy customized to the candidate's skills across 4 stages:
    - **Day 0:** Initial application + resume attachment note.
    - **Day 4:** Follow-Up 1 (courteous check-in).
    - **Day 10:** Follow-Up 2 (value-add message with technical insights).
    - **Day 15:** Final Follow-Up (graceful closing check-in).
* **4-Stage Shifting State Machine (`calculateNextStageTransition` & `shouldPromoteFollowUp`):**
  - `TO_APPLY` → `WAITING_FU1` (+4 days) → `FOLLOW_UP_1` → `WAITING_FU2` (+10 days) → `FOLLOW_UP_2` → `WAITING_FU3` (+15 days) → `FOLLOW_UP_3` → `CLOSED`.
  - Immediate short-circuit: Logging an HR response (`POST /api/jobs/applications/[id]/reply`) sets stage to `REPLIED` and nullifies `nextActionAt`, permanently halting further follow-ups.
  - Hourly Inngest scheduler `jobFollowUpScheduler` (`0 * * * *`) promotes buffer states and auto-dispatches follow-ups if `autoSend` is enabled.

### 8.2 End-to-End Testing Procedure
1. **Resume & Channel Setup:**
   - Navigate to `/jobs`. Click "Upload Resume". Paste technical experience; confirm detected skills render as chips.
   - In category channels, select "Start-up Companies" and "Big Sharks". Click "Find & Queue Jobs".
   - Confirm active jobs populate in Tab `1. Apply`.
2. **Application Dispatch (Day 0):**
   - Click "Preview Draft" on a job. Review AI-tailored subject and pitch referencing extracted skills.
   - Click "Dispatch Email". Verify the job moves out of `1. Apply`, `appliedAt` is stamped, `nextActionAt` is set to 4 days ahead, and a fresh replacement job is automatically backfilled into `1. Apply`.
3. **Follow-Up State Shifting (Day 4 & Day 10):**
   - Simulate elapsed time (or advance record `nextActionAt`). Verify job surfaces in Tab `2. Follow-Up 1 (Day 4)`.
   - Dispatch Follow-Up 1. Verify job advances to `WAITING_FU2` scheduled for Day 10.
4. **HR Reply Short-Circuit:**
   - Click "HR Replied" on an active application and submit notes.
   - Verify job immediately moves to `Replied & Closed` tab and no further follow-up triggers occur.

---

## 9. Automated Test Verification Summary

To execute the entire 60-test domain and logic suite:
```bash
npm test
```
To verify full TypeScript strict type safety:
```bash
npm run typecheck
```
To validate Prisma schema integrity:
```bash
npx prisma validate
```
To run Playwright End-to-End browser tests:
```bash
npm run test:e2e
```
