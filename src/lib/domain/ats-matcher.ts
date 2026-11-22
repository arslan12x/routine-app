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
 * Robust token-boundary matching for technical skills that avoids word-boundary
 * failures on special characters (C++, C#, .NET) and false positives on substring matches.
 */
export function matchesSkillToken(text: string, token: string): boolean {
  if (!text || !token) return false;
  const lowerToken = token.toLowerCase();

  if (lowerToken === "c++" || lowerToken === "cpp") {
    return /(?:^|[^a-zA-Z0-9])c\+\+(?:[^a-zA-Z0-9+]|$)/i.test(text) || /\bcpp\b/i.test(text);
  }
  if (lowerToken === "c#" || lowerToken === "csharp" || lowerToken === "c-sharp") {
    return /(?:^|[^a-zA-Z0-9])c#(?:[^a-zA-Z0-9#]|$)/i.test(text) || /\bcsharp\b/i.test(text);
  }
  if (lowerToken === ".net") {
    return /(?:^|[\s,;/|(])\.net(?:\s+core|\s+framework|\s+[0-9]+|\b|$)/i.test(text);
  }

  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * Strict matcher for Go (Golang) to eliminate false positives from common English
 * idioms ("go live", "let's go", "go forward") and substring collisions ("Cognito", "Google", "MongoDB").
 */
export function matchesGoLanguage(rawText: string): boolean {
  if (!rawText) return false;

  // 1. Unambiguous Golang references (case-insensitive)
  if (/(?<![a-zA-Z0-9])(?:golang|go-lang|go\s+lang(?:uage)?)(?![a-zA-Z0-9])/i.test(rawText)) {
    return true;
  }

  // 2. Standalone "Go" must be capitalized and appear in technical/programming context
  const goRegex = /(?:^|[^a-zA-Z0-9+#.])Go(?:[^a-zA-Z0-9+#.]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = goRegex.exec(rawText)) !== null) {
    const idx = match.index;
    const surrounding = rawText.slice(Math.max(0, idx - 45), Math.min(rawText.length, idx + 45));
    const lower = surrounding.toLowerCase();

    // Reject common English idioms with "go"
    if (/\b(?:go\s+(?:to|live|through|ahead|forward|for|with|into|over|back|out|in|no)|let's\s+go|on\s+the\s+go|way\s+to\s+go|give\s+it\s+a\s+go)\b/i.test(lower)) {
      continue;
    }

    // Must be in a skills/tech listing or flanked by programming languages/tools
    const isTechContext =
      /\b(?:languages?|skills?|technologies|tech\s*stack|backend|frameworks|developer|engineer|programming)\b/i.test(lower) ||
      /(?:java|python|rust|c\+\+|c#|typescript|javascript|ruby|php|kotlin|scala|docker|kubernetes)[,\s/|]+Go\b/.test(surrounding) ||
      /\bGo[,\s/|]+(?:java|python|rust|c\+\+|c#|typescript|javascript|ruby|php|kotlin|scala|docker|kubernetes)/.test(surrounding);

    if (isTechContext) {
      return true;
    }
  }

  return false;
}

/**
 * Standard IT skill taxonomy for technical role extraction.
 */
export const IT_SKILL_TAXONOMY: Array<{
  label: string;
  aliases: string[];
  customMatcher?: (text: string) => boolean;
}> = [
  // Languages
  { label: "Java", aliases: ["java", "core java", "java 17", "java 21", "java 11", "java 8", "j2ee"] },
  { label: "Python", aliases: ["python", "python3", "python 3"] },
  { label: "TypeScript", aliases: ["typescript", "ts"] },
  { label: "JavaScript", aliases: ["javascript", "js", "es6", "ecmascript"] },
  { label: "Go", aliases: ["golang", "go-lang", "go language", "go lang"], customMatcher: matchesGoLanguage },
  { label: "C++", aliases: ["c++", "cpp"] },
  { label: "C#", aliases: ["c#", "csharp", "c-sharp", "dotnet", ".net core", "asp.net", ".net framework", ".net"] },
  { label: "Rust", aliases: ["rust", "cargo"] },
  { label: "Kotlin", aliases: ["kotlin"] },
  { label: "Swift", aliases: ["swift", "ios development"] },
  { label: "PHP", aliases: ["php", "laravel", "symfony"] },
  { label: "Ruby", aliases: ["ruby", "ruby on rails", "rails"] },
  { label: "SQL", aliases: ["sql", "rdbms", "pl/sql", "t-sql"] },

  // Frameworks & Frontend
  { label: "React", aliases: ["react", "react.js", "reactjs"] },
  { label: "Next.js", aliases: ["next.js", "nextjs", "next 14", "next 15", "next 16"] },
  { label: "Vue", aliases: ["vue", "vue.js", "vuejs", "nuxt", "nuxtjs"] },
  { label: "Angular", aliases: ["angular", "angularjs"] },
  { label: "HTML5", aliases: ["html", "html5"] },
  { label: "CSS3", aliases: ["css", "css3", "sass", "scss", "less"] },
  { label: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"] },
  { label: "Material-UI", aliases: ["material-ui", "material ui", "mui"] },
  { label: "Redux", aliases: ["redux", "redux toolkit", "rtk"] },
  { label: "Zustand", aliases: ["zustand"] },

  // Backend & Architecture
  { label: "Spring Boot", aliases: ["spring boot", "springboot", "spring framework", "spring boot 3", "spring"] },
  { label: "Spring Security", aliases: ["spring security"] },
  { label: "Spring Data JPA", aliases: ["spring data jpa", "spring data", "jpa", "hibernate"] },
  { label: "Node.js", aliases: ["node.js", "nodejs", "node"] },
  { label: "Express", aliases: ["express.js", "expressjs", "express"] },
  { label: "NestJS", aliases: ["nestjs", "nest.js"] },
  { label: "Fastify", aliases: ["fastify"] },
  { label: "Django", aliases: ["django", "django rest framework", "drf"] },
  { label: "FastAPI", aliases: ["fastapi"] },
  { label: "Flask", aliases: ["flask"] },
  { label: "Microservices", aliases: ["microservices", "micro-services", "microservice architecture"] },
  { label: "REST APIs", aliases: ["rest api", "rest apis", "restful", "restful api", "restful apis"] },
  { label: "GraphQL", aliases: ["graphql", "apollo graphql"] },
  { label: "WebSocket", aliases: ["websocket", "websockets", "socket.io"] },
  { label: "Microsoft Graph API", aliases: ["microsoft graph", "microsoft graph api", "ms graph"] },

  // Databases & Caching
  { label: "PostgreSQL", aliases: ["postgresql", "postgres", "psql"] },
  { label: "MySQL", aliases: ["mysql"] },
  { label: "MongoDB", aliases: ["mongodb", "mongo"] },
  { label: "Redis", aliases: ["redis", "in-memory cache"] },
  { label: "DynamoDB", aliases: ["dynamodb", "aws dynamodb", "amazon dynamodb"] },
  { label: "Prisma", aliases: ["prisma", "prisma orm"] },
  { label: "SQLite", aliases: ["sqlite"] },

  // Messaging & Event Streaming
  { label: "Kafka", aliases: ["apache kafka", "kafka"] },
  { label: "RabbitMQ", aliases: ["rabbitmq", "amqp", "message broker"] },

  // Security, Identity & Auth
  { label: "JWT", aliases: ["jwt", "json web token", "json web tokens"] },
  { label: "OAuth2", aliases: ["oauth", "oauth2", "oauth 2.0", "openid connect", "oidc"] },
  { label: "AWS Cognito", aliases: ["cognito", "aws cognito", "amazon cognito"] },
  { label: "LDAP", aliases: ["ldap"] },
  { label: "RBAC", aliases: ["rbac", "role based access control", "role-based access control"] },

  // Cloud & DevOps
  { label: "AWS", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda", "cloudwatch"] },
  { label: "AWS Bedrock", aliases: ["aws bedrock", "bedrock", "amazon bedrock"] },
  { label: "Amazon Chime SDK", aliases: ["amazon chime", "amazon chime sdk", "chime sdk"] },
  { label: "Docker", aliases: ["docker", "containerization", "containers"] },
  { label: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { label: "CI/CD", aliases: ["ci/cd", "ci cd", "continuous integration", "gitlab ci", "gitlab ci/cd", "github actions", "jenkins"] },
  { label: "Linux", aliases: ["linux", "unix", "bash", "shell scripting"] },
  { label: "Git", aliases: ["git", "github", "gitlab"] },
  { label: "GCP", aliases: ["gcp", "google cloud", "google cloud platform"] },
  { label: "Azure", aliases: ["azure", "microsoft azure"] },
  { label: "Terraform", aliases: ["terraform", "iac"] },

  // Testing & Engineering Core
  { label: "Unit Testing", aliases: ["unit testing", "junit", "mockito", "jest", "vitest", "playwright", "cypress", "tdd"] },
  { label: "System Design", aliases: ["system design", "distributed systems", "high availability", "scalability"] },
  { label: "DSA", aliases: ["dsa", "data structures", "algorithms", "problem solving"] },
];

/**
 * Checks whether text contains a given skill using taxonomy definitions.
 */
export function textHasSkill(text: string, skillLabel: string): boolean {
  if (!text) return false;
  if (skillLabel.toLowerCase() === "go") {
    return matchesGoLanguage(text);
  }
  const skillDef = IT_SKILL_TAXONOMY.find((s) => s.label.toLowerCase() === skillLabel.toLowerCase());
  if (!skillDef) {
    return matchesSkillToken(text, skillLabel);
  }
  if (skillDef.customMatcher) {
    return skillDef.customMatcher(text);
  }
  return skillDef.aliases.some((alias) => matchesSkillToken(text, alias));
}

/**
 * Extracts matching technical skills from unstructured text based on taxonomy.
 */
export function extractTaxonomySkills(text: string): string[] {
  if (!text) return [];
  const matched = new Set<string>();

  for (const skill of IT_SKILL_TAXONOMY) {
    if (skill.customMatcher) {
      if (skill.customMatcher(text)) {
        matched.add(skill.label);
      }
      continue;
    }

    for (const alias of skill.aliases) {
      if (matchesSkillToken(text, alias)) {
        matched.add(skill.label);
        break;
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
  "years", "year", "yrs", "yr", "yoe",
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
    const isInResumeText = isDirectSkill || textHasSkill(resumeText, skill);

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
      : `Strong match across key requirements: ${topMatched}.`;
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
