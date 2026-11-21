import {
  type CandidateExperienceLevel,
  inferExperienceLevelFromTitle,
} from "./jobs";

export type ExperienceFit = "STRONG" | "PARTIAL" | "STRETCH";
export type ProbabilityLabel = "High" | "Moderate" | "Stretch";

export interface AtsMatchBreakdown {
  score: number; // 0-100
  probabilityLabel: ProbabilityLabel;
  experienceFit: ExperienceFit;
  matchedSkills: string[];
  missingSkills: string[];
  skillScore: number;
  titleScore: number;
  experienceScore: number;
  summary: string;
  deepAnalysis?: {
    probabilityPercent: number;
    verdict: string;
    strengths: string[];
    gaps: string[];
    resumeTweaks: string[];
    interviewFocusTopics: string[];
    analyzedAt: string;
  };
}

/**
 * Standard IT skill taxonomy for technical role extraction.
 */
export const IT_SKILL_TAXONOMY: Array<{ label: string; aliases: string[] }> = [
  // Languages
  { label: "Java", aliases: ["java", "core java", "java 17", "java 21", "java 11", "java 8"] },
  { label: "Python", aliases: ["python", "python3", "django", "fastapi", "flask"] },
  { label: "TypeScript", aliases: ["typescript", "ts"] },
  { label: "JavaScript", aliases: ["javascript", "js", "es6", "ecmascript"] },
  { label: "Go", aliases: ["golang", "go language", "\\bgo\\b"] },
  { label: "C++", aliases: ["c\\+\\+", "cpp"] },
  { label: "C#", aliases: ["c#", "csharp", ".net", "dotnet", "asp.net"] },
  { label: "Rust", aliases: ["rust", "cargo"] },
  { label: "Kotlin", aliases: ["kotlin"] },
  { label: "Swift", aliases: ["swift", "ios development"] },
  { label: "PHP", aliases: ["php", "laravel"] },
  { label: "Ruby", aliases: ["ruby", "ruby on rails", "rails"] },

  // Frameworks & Frontend
  { label: "React", aliases: ["react", "react.js", "reactjs"] },
  { label: "Next.js", aliases: ["next.js", "nextjs", "next 14", "next 15", "next 16"] },
  { label: "Node.js", aliases: ["node.js", "nodejs", "node"] },
  { label: "Spring Boot", aliases: ["spring boot", "springboot", "spring framework", "spring"] },
  { label: "Microservices", aliases: ["microservices", "micro-services", "microservice architecture"] },
  { label: "Express", aliases: ["express.js", "expressjs", "express"] },
  { label: "NestJS", aliases: ["nestjs", "nest.js"] },
  { label: "Tailwind CSS", aliases: ["tailwind", "tailwindcss"] },
  { label: "GraphQL", aliases: ["graphql", "apollo"] },
  { label: "REST APIs", aliases: ["rest api", "rest apis", "restful", "rest"] },

  // Databases & Caching
  { label: "PostgreSQL", aliases: ["postgresql", "postgres", "psql"] },
  { label: "MySQL", aliases: ["mysql"] },
  { label: "MongoDB", aliases: ["mongodb", "mongo"] },
  { label: "Redis", aliases: ["redis", "in-memory cache"] },
  { label: "Kafka", aliases: ["apache kafka", "kafka"] },
  { label: "RabbitMQ", aliases: ["rabbitmq", "message broker", "amqp"] },
  { label: "Prisma", aliases: ["prisma", "prisma orm"] },
  { label: "Hibernate", aliases: ["hibernate", "jpa"] },
  { label: "SQL", aliases: ["sql", "relational database", "rdbms"] },

  // Cloud & DevOps
  { label: "AWS", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"] },
  { label: "Docker", aliases: ["docker", "containerization", "containers"] },
  { label: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { label: "CI/CD", aliases: ["ci/cd", "ci cd", "continuous integration", "github actions", "gitlab ci"] },
  { label: "GCP", aliases: ["gcp", "google cloud", "google cloud platform"] },
  { label: "Azure", aliases: ["azure", "microsoft azure"] },
  { label: "Linux", aliases: ["linux", "unix", "bash", "shell scripting"] },
  { label: "Git", aliases: ["git", "github", "gitlab"] },

  // Architecture & Engineering Core
  { label: "System Design", aliases: ["system design", "distributed systems", "high availability", "scalability"] },
  { label: "DSA", aliases: ["dsa", "data structures", "algorithms", "problem solving"] },
  { label: "Unit Testing", aliases: ["unit testing", "junit", "mockito", "jest", "vitest", "tdd"] },
];

/**
 * Extracts matching technical skills from unstructured text based on taxonomy.
 */
export function extractTaxonomySkills(text: string): string[] {
  if (!text) return [];
  const normalized = text.toLowerCase();
  const matched = new Set<string>();

  for (const skill of IT_SKILL_TAXONOMY) {
    for (const alias of skill.aliases) {
      if (alias.startsWith("\\b")) {
        const regex = new RegExp(alias, "i");
        if (regex.test(normalized)) {
          matched.add(skill.label);
          break;
        }
      } else {
        if (normalized.includes(alias)) {
          matched.add(skill.label);
          break;
        }
      }
    }
  }

  return Array.from(matched);
}

/**
 * Inactive or generic words to ignore when comparing role titles.
 */
const GENERIC_TITLE_TOKENS = new Set([
  "the", "and", "or", "for", "with", "in", "at", "to", "of", "a", "an",
  "senior", "junior", "lead", "staff", "principal", "associate", "intern",
  "ii", "iii", "iv", "sr", "jr", "mid", "level", "role", "position",
]);

/**
 * Calculates deterministic ATS shortlist probability (0–100%)
 * based on skill overlap (60%), role alignment (20%), and experience fit (20%).
 */
export function calculateAtsMatch(
  resumeText: string = "",
  resumeSkills: string[] = [],
  jobTitle: string = "",
  jobDescription?: string | null,
  candidateExperienceLevel: CandidateExperienceLevel = "MID"
): AtsMatchBreakdown {
  const normalizedResumeText = resumeText.toLowerCase();
  const resumeSkillSet = new Set(
    resumeSkills.map((s) => s.toLowerCase().trim()).filter(Boolean)
  );

  // 1. Extract required skills from JD + Job Title
  const jdContent = `${jobTitle}\n${jobDescription || ""}`;
  let jdSkills = extractTaxonomySkills(jdContent);

  // Fallback defaults based on role domain if JD text has sparse skill mentions
  if (jdSkills.length < 3) {
    const titleLower = jobTitle.toLowerCase();
    if (titleLower.includes("frontend") || titleLower.includes("react")) {
      jdSkills = Array.from(new Set([...jdSkills, "React", "TypeScript", "JavaScript", "Next.js", "Tailwind CSS", "REST APIs"]));
    } else if (titleLower.includes("backend") || titleLower.includes("java") || titleLower.includes("python") || titleLower.includes("go")) {
      jdSkills = Array.from(new Set([...jdSkills, "Java", "Spring Boot", "Microservices", "PostgreSQL", "Redis", "Docker", "REST APIs"]));
    } else if (titleLower.includes("full-stack") || titleLower.includes("fullstack")) {
      jdSkills = Array.from(new Set([...jdSkills, "React", "TypeScript", "Node.js", "PostgreSQL", "REST APIs", "Docker"]));
    } else if (titleLower.includes("devops") || titleLower.includes("cloud") || titleLower.includes("sre")) {
      jdSkills = Array.from(new Set([...jdSkills, "AWS", "Docker", "Kubernetes", "CI/CD", "Linux", "Git"]));
    } else {
      jdSkills = Array.from(new Set([...jdSkills, "TypeScript", "Node.js", "PostgreSQL", "REST APIs", "Git"]));
    }
  }

  // 2. Identify Matched vs Missing Skills
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of jdSkills) {
    const lower = skill.toLowerCase();
    const isDirectSkill = resumeSkillSet.has(lower);
    const isInResumeText = normalizedResumeText.includes(lower);

    if (isDirectSkill || isInResumeText) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  // Skill Score: 60% of total score
  const skillRatio = jdSkills.length > 0 ? matchedSkills.length / jdSkills.length : 0.5;
  const skillScore = Math.min(60, Math.round(skillRatio * 60));

  // 3. Role & Title Alignment: 20% of total score
  const titleTokens = jobTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !GENERIC_TITLE_TOKENS.has(t));

  let matchedTitleTokens = 0;
  for (const token of titleTokens) {
    if (normalizedResumeText.includes(token) || resumeSkillSet.has(token)) {
      matchedTitleTokens++;
    }
  }
  const titleRatio = titleTokens.length > 0 ? matchedTitleTokens / titleTokens.length : 0.5;
  const titleScore = Math.min(20, Math.round(titleRatio * 20));

  // 4. Experience Tier Fit: 20% of total score
  const targetExpLevel = inferExperienceLevelFromTitle(jobTitle);
  const expTierOrder: CandidateExperienceLevel[] = ["FRESHER", "JUNIOR", "MID", "SENIOR"];
  const candidateIndex = expTierOrder.indexOf(candidateExperienceLevel);
  const targetIndex = expTierOrder.indexOf(targetExpLevel);

  const tierDiff = Math.abs(candidateIndex - targetIndex);
  let experienceScore = 20;
  let experienceFit: ExperienceFit = "STRONG";

  if (tierDiff === 0) {
    experienceScore = 20;
    experienceFit = "STRONG";
  } else if (tierDiff === 1) {
    experienceScore = 12;
    experienceFit = "PARTIAL";
  } else {
    experienceScore = 4;
    experienceFit = "STRETCH";
  }

  // Special penalty if candidate is FRESHER applying for SENIOR role
  if (candidateExperienceLevel === "FRESHER" && targetExpLevel === "SENIOR") {
    experienceScore = 2;
    experienceFit = "STRETCH";
  }

  // 5. Aggregate Score & Probability Label
  const rawTotal = skillScore + titleScore + experienceScore;
  const score = Math.max(12, Math.min(98, rawTotal));

  let probabilityLabel: ProbabilityLabel = "Moderate";
  if (score >= 75) {
    probabilityLabel = "High";
  } else if (score < 50) {
    probabilityLabel = "Stretch";
  }

  // 6. Natural Language Summary
  let summary = "";
  const topMatched = matchedSkills.slice(0, 3).join(", ");
  const topMissing = missingSkills.slice(0, 2).join(", ");

  if (probabilityLabel === "High") {
    summary = topMissing
      ? `Strong match on ${topMatched}; review ${topMissing} prior to interview.`
      : `High ATS alignment across key requirements: ${topMatched}.`;
  } else if (probabilityLabel === "Moderate") {
    summary = topMatched && topMissing
      ? `Moderate alignment on ${topMatched}; highlight transferable depth in ${topMissing}.`
      : `Moderate ATS fit with ${experienceFit.toLowerCase()} experience alignment.`;
  } else {
    summary = topMissing
      ? `Stretch role: core requirements prioritize ${topMissing}.`
      : `Stretch target: requires notable experience and tooling bridge.`;
  }

  return {
    score,
    probabilityLabel,
    experienceFit,
    matchedSkills,
    missingSkills,
    skillScore,
    titleScore,
    experienceScore,
    summary,
  };
}
