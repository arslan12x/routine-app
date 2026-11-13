ALTER TABLE public."Task"
  ADD COLUMN "aiCourseName" TEXT,
  ADD COLUMN "aiCoursePrompt" TEXT;

ALTER TABLE public."Task"
  DROP CONSTRAINT "Task_ai_study_settings_check",
  ADD CONSTRAINT "Task_ai_study_settings_check"
  CHECK (
    (
      "isAiGated" = false
      AND "aiSubject" IS NULL
      AND "aiCourseName" IS NULL
      AND "aiCoursePrompt" IS NULL
    )
    OR (
      "isAiGated" = true
      AND "aiSubject" IS NOT NULL
      AND (
        (
          "aiSubject" = 'CUSTOM'
          AND NULLIF(BTRIM("aiCourseName"), '') IS NOT NULL
          AND NULLIF(BTRIM("aiCoursePrompt"), '') IS NOT NULL
        )
        OR (
          "aiSubject" <> 'CUSTOM'
          AND "aiCourseName" IS NULL
          AND "aiCoursePrompt" IS NULL
        )
      )
    )
  );
