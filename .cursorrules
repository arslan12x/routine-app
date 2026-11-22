# STRICT FAST-EXECUTION & CODEBASE MAP PROTOCOL (MANDATORY FOR EVERY TASK)

You MUST follow this exact workflow for every request, bug fix, refactor, or new feature in this repository:

1. **MANDATORY FIRST STEP — READ `CODEBASE_MAP.md` ONLY:**
   - Before running ANY tool, search, or file read, open and read `CODEBASE_MAP.md` in the project root.
   - Treat `CODEBASE_MAP.md` as your primary source of truth for file locations, API routes, server services, domain helpers, UI components, and conventions.

2. **STRICT NO-SCAN RULE:**
   - If `CODEBASE_MAP.md` already lists the files for the target feature/module:
     - **DO NOT** run repo-wide `find`, `grep`, `search`, or `list_dir` commands.
     - **DO NOT** read unrelated files or explore the repository.
     - Immediately open **ONLY** the exact files listed in `CODEBASE_MAP.md` for that module and apply the modification.

3. **CONTROLLED FALLBACK (ONLY WHEN MISSING FROM `CODEBASE_MAP.md`):**
   - You are permitted to search/analyze the codebase **ONLY** if:
     1. The requested feature, file, route, or symbol is explicitly missing from `CODEBASE_MAP.md`, OR
     2. A file path listed in `CODEBASE_MAP.md` no longer exists.
   - When falling back, keep searches narrow and scoped to the single relevant directory (e.g., `src/features/<module>/` or `src/server/services/`). Never scan the entire repository when a directory-level lookup is sufficient.

4. **SURGICAL IMPLEMENTATION & VERIFICATION:**
   - Follow all conventions documented in `CODEBASE_MAP.md`.
   - For small/single-module edits: run `npm run typecheck` and targeted tests (`npx vitest run -t "<relevant-test>"`).
   - For schema changes or multi-module features: run `npx prisma validate`, `npm run typecheck`, `npm test`, and `npx next build`.

5. **MANDATORY POST-MODIFICATION SYNC (`CODEBASE_MAP.md`):**
   - **After ANY modification to the codebase**, before ending your turn, you MUST review what changed and update `CODEBASE_MAP.md` in the same turn to reflect:
     - Any added, renamed, moved, or deleted files, API routes, or Prisma models.
     - Any added, renamed, or removed exported functions, hooks, or domain helpers.
     - Any updated module behavior, env vars, or conventions.
     - Any file/symbol you had to search for because it was missing from `CODEBASE_MAP.md`.
   - Keep `CODEBASE_MAP.md` concise (under 200 lines) by replacing outdated entries rather than appending bloat.
   - In your final summary for every task, explicitly confirm whether `CODEBASE_MAP.md` was updated (or state `CODEBASE_MAP.md: no structural changes needed` if only internal logic changed).
