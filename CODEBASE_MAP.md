# CODEBASE MAP

## 1. Core Conventions
- **API Wrapper & Validation:** Wrap all route handlers with `route({ auth: true })` from `src/lib/api.ts`; parse request bodies with Zod schemas from `src/lib/validation.ts`. Throw `ApiError(code, category, message)`.
- **Database Access & RLS:** Use `withUserDb(userId, (tx) => ...)` in `src/lib/db.ts` for all user-scoped queries (sets `app.current_user_id` for Supabase RLS). Use `systemDb` exclusively for Inngest background crons, NextAuth adapters, and admin bootstrap. Never expose `systemDb` directly in user routes.
- **Prisma Migrations:** Forward-only SQL migrations in `prisma/migrations/`. Never rewrite, edit, or delete existing applied migrations. Use `ADD COLUMN IF NOT EXISTS` and idempotent table constraints.
- **Verification Commands:** Run `npm run typecheck` (tsc check), `npm test` (vitest unit suite), `npx prisma validate`, and `npx next build --webpack` (production build).

## 2. Module-to-File Map

| Module | UI (App & Features) | API Routes | Server Services & AI | Domain Logic & DB Models |
|---|---|---|---|---|
| **Auth & Admin** | `app/(dashboard)/admin/page.tsx`<br>`features/admin/*`<br>`app/login/page.tsx` | `api/auth/[...all]`<br>`api/admin/accounts/*`<br>`api/admin/audit`<br>`api/admin/workspaces` | `server/services/admin.ts`<br>`lib/auth/session.ts` | `lib/auth/providers.ts`<br>Models: `User`, `Account`, `Session`, `AllowedEmail`, `Workspace`, `AuditLog` |
| **Tasks & Sync** | `app/(dashboard)/tasks/page.tsx`<br>`features/tasks/*`<br>`components/Nav.tsx` | `api/tasks`<br>`api/tasks/[id]`<br>`api/tasks/[id]/progress`<br>`api/today`<br>`api/me/modules` | `server/services/tasks.ts`<br>`server/repositories/tasks.ts` | `lib/domain/schedule.ts`<br>`lib/domain/streaks.ts`<br>`lib/domain/sync.ts`<br>`lib/domain/types.ts`<br>Models: `Task`, `TaskVersion`, `DailyLog` |
| **AI Study & Coach** | `features/tasks/AiStudyModal.tsx`<br>`features/insights/CoachReviewCard.tsx` | `api/ai/study`<br>`api/coach/latest`<br>`api/tasks/[id]/learning-context` | `server/ai/coach.ts`<br>`server/ai/learning-context.ts`<br>`server/ai/prompts.ts`<br>`server/ai/reminders.ts` | Models: `AiStudySession`, `CoachReview` |
| **Challenges** | `app/(dashboard)/challenges/page.tsx`<br>`features/challenges/*` | `api/challenges`<br>`api/challenges/[id]/join` | `server/services/challenges.ts` | Models: `Challenge`, `ChallengeParticipant` |
| **Friends & Stats** | `app/(dashboard)/friends/page.tsx`<br>`app/(dashboard)/insights/*`<br>`features/friends/*`<br>`features/insights/*` | `api/friends/*`<br>`api/insights`<br>`api/leaderboard`<br>`api/calendar`<br>`api/export` | `server/services/friends.ts`<br>`server/services/stats.ts`<br>`server/services/achievements.ts` | `lib/domain/ranking.ts`<br>`lib/domain/analytics.ts`<br>`lib/domain/achievements.ts`<br>Models: `Friendship`, `UserAchievement` |
| **Novels** | `app/(dashboard)/novels/*`<br>`features/novels/*` | `api/novels`<br>`api/novels/[id]/read`<br>`api/novels/[id]/quiz/*`<br>`api/novels/sessions` | `server/services/novel-reader.ts`<br>`server/services/novels.ts` | `lib/domain/novels.ts`<br>Models: `NovelCatalog`, `NovelReadingSession` |
| **Blogs** | `app/(dashboard)/blogs/page.tsx`<br>`features/blogs/*` | `api/blogs`<br>`api/blogs/plan`<br>`api/blogs/[planId]/*` | `server/services/blogs.ts` | Models: `BlogPlan`, `BlogDay` |
| **Duolingo** | `features/settings/SettingsForm.tsx`<br>`features/tasks/DayTasks.tsx` | `api/integrations/duolingo`<br>`api/integrations/duolingo/sync` | `server/services/duolingo.ts` | Models: `UserIntegration` (`provider: "DUOLINGO"`) |
| **Finance** | `app/(dashboard)/finance/page.tsx`<br>`features/finance/*` | `api/finance/summary`<br>`api/finance/expenses/*`<br>`api/finance/budgets`<br>`api/finance/import` | `server/services/finance.ts`<br>`server/finance/csv-provider.ts` | Models: `Expense`, `Budget` |
| **Jobs, ATS & Email** | `app/(dashboard)/jobs/page.tsx`<br>`features/jobs/*` | `api/jobs/companies`<br>`api/jobs/refresh`<br>`api/jobs/resume`<br>`api/jobs/profile`<br>`api/jobs/email-config`<br>`api/jobs/email-sync`<br>`api/jobs/applications/*` | `server/services/jobs.ts`<br>`server/services/job-scraper.ts`<br>`server/services/live-job-fetchers.ts`<br>`server/services/resume-parser.ts`<br>`server/services/email-transport.ts`<br>`server/services/email-inbox.ts`<br>`server/ai/jobs.ts` | `lib/domain/ats-matcher.ts`<br>`lib/domain/jobs.ts`<br>`lib/domain/live-jobs.ts`<br>`lib/domain/email-config.ts`<br>`lib/pdf-generator.ts`<br>`lib/crypto.ts`<br>Models: `HiringCompany`, `JobApplication`, `UserResume`, `CandidateJobProfile`, `UserIntegration` |
| **Inngest Crons** | — | `api/inngest` | `inngest/client.ts`<br>`inngest/functions.ts` | Crons: `hourlyTaskReminderWorker`, `weeklyCoachReviewScheduler`, `jobFollowUpScheduler`, `jobBatchRotationScheduler`, `liveJobSyncWorker` |
| **Prisma & DB** | — | — | `lib/db.ts` (`withUserDb`, `systemDb`, `adminDb`) | `prisma/schema.prisma`<br>`prisma/migrations/*` |

## 3. Key Exports Index
- **`server/services/tasks.ts`**: `createTask`, `updateTask`, `deleteTask`, `listTasks`, `dayView`, `setProgress`, `completeAiStudyTask`, `aiStudyTaskContext`, `syncFeatureTaskCompletion`, `getEnabledModulesForUser`
- **`server/services/jobs.ts`**: `saveUserResume`, `getUserResume`, `saveCandidateProfile`, `getCandidateProfile`, `saveCandidateEmail`, `syncLiveJobsForCandidate`, `recalculateUserAtsScores`, `refreshAndRotateHiringBatch`, `listUserApplications`, `getJobEmailDraftForApp`, `applyToJob`, `sendJobFollowUp`, `logHrReply`, `toggleAutoSend`, `advanceJobPipeline`
- **`server/services/job-scraper.ts`**: `ensureCompanyDirectorySeeded`, `rotateAllHiringCompanies`, `rotateStartupCompanies`, `getRoleForExperience`, `CURATED_COMPANIES`
- **`server/services/live-job-fetchers.ts`**: `fetchAllActiveLiveJobs`, `fetchGreenhouseJobs`, `fetchLeverJobs`, `fetchAshbyJobs`, `fetchHimalayasJobs`, `fetchJobicyJobs`, `fetchRemoteOkJobs`, `fetchRemotiveJobs`, `fetchArbeitnowJobs`, `inferCompanyCategoryFromMeta`, `stripHtmlTags`
- **`server/services/resume-parser.ts`**: `cleanDocumentText`, `validateReadableText`, `extractResumeText`
- **`server/services/email-transport.ts`**: `verifyEmailCredentials`, `isDirectEmailConfigured`, `sendDirectEmail`
- **`server/services/email-inbox.ts`**: `syncRecruiterRepliesForUser`
- **`server/services/novel-reader.ts`**: `stripBookHtmlAndBoilerplate`, `splitBookIntoChapters`, `splitChapterIntoHalves`, `fetchNovelFullText`, `getHalfChapterForNovel`, `generateNovelQuiz`, `submitNovelQuiz`, `buildDeterministicReadingQuiz`
- **`server/services/novels.ts`**: `listNovels`, `updateReadingSession`, `getUserReadingSessions`, `fetchFromGutendex`, `reconcileActiveReadingSessions`
- **`server/services/blogs.ts`**: `createBlogPlan`, `listBlogPlans`, `getBlogPlan`, `generateDayContent`, `updateDayMarkdown`, `deleteBlogPlan`
- **`server/services/duolingo.ts`**: `getDuolingoIntegration`, `upsertDuolingoIntegration`, `syncDuolingo`
- **`server/services/finance.ts`**: `getFinanceSummary`, `createExpense`, `deleteExpense`, `setBudget`, `importExpensesFromProvider`
- **`server/services/friends.ts`**: `discoverFriends`, `createFriendRequest`, `respondToFriendRequest`
- **`server/services/stats.ts`**: `streaks`, `calendar`, `insights`, `leaderboard`, `exportAll`
- **`server/services/achievements.ts`**: `syncUserAchievements`, `getUsersBadgesMap`
- **`server/services/admin.ts`**: `listAllowed`, `addAllowed`, `revokeAllowed`, `restoreAllowed`, `createWorkspace`, `listAuditLog`
- **`server/ai/jobs.ts`**: `generateJobEmailDraft`, `analyzeJobAtsFit`, `buildFallbackEmail`
- **`server/ai/coach.ts`**: `generateWeeklyCoachReview`, `getLatestCoachReview`, `buildFallbackCoachReview`
- **`server/ai/learning-context.ts`**: `getTaskLearningContext`, `computeTaskStreakAndCompletedDays`
- **`lib/domain/ats-matcher.ts`**: `calculateAtsMatch`, `extractTaxonomySkills`, `matchesSkillToken`, `matchesGoLanguage`, `IT_SKILL_TAXONOMY`
- **`lib/domain/jobs.ts`**: `matchesLocationFilter`, `inferExperienceLevelFromTitle`, `calculateNextStageTransition`, `shouldPromoteFollowUp`, `isValidHrEmail`, `extractAndValidateEmails`, `COMPANY_CATEGORIES`, `LOCATION_ELIGIBILITY_FILTERS`
- **`lib/domain/live-jobs.ts`**: `isEngineeringRole`, `classifyJobLocation`, `scoreLiveJobPriority`, `compareLiveJobsPriority`, `formatRelativeJobTime`
- **`lib/domain/email-config.ts`**: `getEmailProviderPreset`, `matchRecruiterReply`, `extractEmailAddress`, `isValidEmailAddress`, `sanitizeEmailContent`, `EMAIL_PRESETS`
- **`lib/domain/schedule.ts`**: `logKey`, `scheduledOn`, `isDone`, `progressOf`, `dayInfo`, `weekDays`
- **`lib/domain/streaks.ts`**: `computeStreaks`, `recentConsistency`
- **`lib/domain/types.ts`**: `inferPersonalDevType`, `computeEnabledModules`
- **`lib/domain/novels.ts`**: `isValidNovelRedirectUrl`, `canOpenNovel`, `resolveCanonicalActiveReadingSession`, `ALLOWED_NOVEL_HOSTS`
- **`lib/domain/ranking.ts`**: `rankRows`
- **`lib/domain/analytics.ts`**: `computeInsights`
- **`lib/domain/achievements.ts`**: `evaluateEligibleBadges`, `BADGE_DEFINITIONS`
- **`lib/domain/sync.ts`**: `shouldRejectStaleWrite`
- **`lib/crypto.ts`**: `encryptSecret`, `decryptSecret`
- **`lib/pdf-generator.ts`**: `generatePdfFromText`
