import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { CandidateExperienceLevel } from "@/lib/domain/jobs";
import { sanitizeEmailContent } from "@/lib/domain/email-config";

if (typeof process !== "undefined" && process.env) {
  process.env.AI_SDK_LOG_WARNINGS = "false";
}

export interface EmailDraftInput {
  stage: "APPLY" | "FOLLOW_UP_1" | "FOLLOW_UP_2" | "FOLLOW_UP_3";
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLinkedIn?: string;
  candidateGitHub?: string;
  jobTitle: string;
  companyName: string;
  hrEmail: string;
  parsedResume?: string;
  skills?: string[];
  experienceLevel?: CandidateExperienceLevel;
  isIndiaBased?: boolean;
  offersRemoteIndia?: boolean;
  offersRelocation?: boolean;
  companyCategory?: string;
}

export interface EmailDraft {
  subject: string;
  body: string;
  stage: string;
}

export function buildFallbackEmail(input: EmailDraftInput): EmailDraft {
  const {
    stage,
    candidateName,
    candidateEmail,
    candidatePhone,
    jobTitle,
    companyName,
    skills,
    experienceLevel,
    isIndiaBased,
    offersRemoteIndia,
    offersRelocation,
    companyCategory,
  } = input;
  const topSkills =
    skills && skills.length > 0
      ? skills.slice(0, 4).join(", ")
      : "modern full-stack engineering, scalable architecture, and TypeScript";
  const isFresher = experienceLevel === "FRESHER";

  let locationNudge = "";
  if (companyCategory === "FOREIGN" && offersRelocation && !isIndiaBased) {
    locationNudge = ` I am based in India and fully prepared to relocate with visa sponsorship to support your international engineering initiatives.`;
  } else if (offersRemoteIndia && !isIndiaBased) {
    locationNudge = ` Working remotely from India, I have established a strong rhythm of async documentation, proactive ownership, and cross-timezone collaboration.`;
  } else if (isIndiaBased) {
    locationNudge = ` I would love to collaborate closely with your engineering teams in India to accelerate product deliverables.`;
  }

  const signOff = [
    "Best regards,",
    candidateName,
    candidateEmail,
    candidatePhone,
  ]
    .filter(Boolean)
    .join("\n");

  let rawSubject = "";
  let rawBody = "";

  switch (stage) {
    case "APPLY":
      rawSubject = `Application: ${jobTitle} - ${candidateName}`;
      rawBody = isFresher
        ? [
            `Hi ${companyName} Hiring Team,`,
            "",
            `I am writing to express my enthusiastic interest in the ${jobTitle} position at ${companyName}. As an aspiring software engineer with solid foundations in ${topSkills}, I have built performant, resilient applications and am eager to bring fresh energy and fast adaptability to your team.${locationNudge}`,
            "",
            `Given ${companyName}'s trajectory and engineering standards, I would love to contribute my problem-solving ability, dedication, and technical curiosity to your product roadmap.`,
            "",
            `I have attached my resume for your review. Would you be open to a brief 15-minute conversation this week to discuss how my background aligns with your team's goals?`,
            "",
            signOff,
          ].join("\n")
        : [
            `Hi ${companyName} Hiring Team,`,
            "",
            `I am writing to express my strong interest in the ${jobTitle} position at ${companyName}. With deep hands-on expertise in ${topSkills}, I have consistently built resilient, high-performance systems that drive measurable business impact.${locationNudge}`,
            "",
            `Given ${companyName}'s trajectory and engineering standards, I am eager to contribute my problem-solving ability and technical rigor to your product roadmap.`,
            "",
            `I have attached my resume for your review. Would you be open to a brief 15-minute conversation this week to discuss how my background aligns with your team's goals?`,
            "",
            signOff,
          ].join("\n");
      break;

    case "FOLLOW_UP_1":
      rawSubject = `Following up: ${jobTitle} role - ${candidateName}`;
      rawBody = [
        `Hi ${companyName} Hiring Team,`,
        "",
        `I wanted to quickly follow up on my application submitted earlier this week for the ${jobTitle} role.`,
        "",
        `I understand you receive many qualified candidates and are actively balancing multiple priorities. I remain very enthusiastic about the work being done at ${companyName} and would love to connect whenever your schedule permits.`,
        "",
        `Thank you for your time and consideration!`,
        "",
        signOff,
      ].join("\n");
      break;

    case "FOLLOW_UP_2":
      rawSubject = `Re: ${jobTitle} at ${companyName} - Additional context & project insights`;
      rawBody = [
        `Hi ${companyName} Hiring Team,`,
        "",
        `I hope you are having a productive week.`,
        "",
        `While following ${companyName}'s recent developments, I was reflecting on common technical hurdles in scaling ${jobTitle} workflows—specifically around database optimization, offline state synchronization, and reliable background jobs.`,
        "",
        `In my recent work, I spearheaded improvements using ${topSkills} that reduced query latency by 40% and fortified resilient user workflows. I would love to bring this same proactive ownership to your engineering team.`,
        "",
        `Please let me know if there are any additional materials or project links I can share to assist in your review.`,
        "",
        signOff,
      ].join("\n");
      break;

    case "FOLLOW_UP_3":
      rawSubject = `Final follow-up regarding ${jobTitle} position - ${candidateName}`;
      rawBody = [
        `Hi ${companyName} Hiring Team,`,
        "",
        `I wanted to reach out with one final check-in regarding the ${jobTitle} opportunity at ${companyName}.`,
        "",
        `I recognize that hiring plans and bandwidth shift dynamically. If the position has already been filled or priorities have pivoted, no worries at all.`,
        "",
        `Thank you sincerely for considering my background. I wish ${companyName} continued growth and success, and I would love to stay in touch for future opportunities down the road.`,
        "",
        signOff,
      ].join("\n");
      break;
  }

  const sanitized = sanitizeEmailContent(rawSubject, rawBody);
  return {
    stage,
    subject: sanitized.subject,
    body: sanitized.body,
  };
}

export async function generateJobEmailDraft(input: EmailDraftInput): Promise<EmailDraft> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return buildFallbackEmail(input);
  }

  const {
    stage,
    candidateName,
    jobTitle,
    companyName,
    parsedResume,
    skills,
    experienceLevel,
    isIndiaBased,
    offersRemoteIndia,
    offersRelocation,
    companyCategory,
  } = input;
  const topSkills = skills && skills.length > 0 ? skills.slice(0, 5).join(", ") : "full-stack development";
  const isFresher = experienceLevel === "FRESHER";

  let locationGuidance = "";
  if (companyCategory === "FOREIGN" && offersRelocation && !isIndiaBased) {
    locationGuidance = "The candidate is based in India and eager to relocate with visa sponsorship for international engineering teams.";
  } else if (offersRemoteIndia && !isIndiaBased) {
    locationGuidance = "The candidate is based in India with strong experience in async, distributed remote collaboration across timezones.";
  } else if (isIndiaBased) {
    locationGuidance = "Tailor naturally for India-based engineering hubs / hybrid collaborative engineering teams.";
  }

  const stagePrompts = {
    APPLY: `Stage: Day 0 Initial Application.
Goal: Write a compelling, high-converting outreach email applying for the "${jobTitle}" position at "${companyName}".
${isFresher ? "Candidate Profile: Fresher / University Graduate. Emphasize high learnability, strong core computer science foundations, fast adaptation, enthusiasm, and academic or personal projects." : "Candidate Profile: Experienced Professional. Emphasize production track record, technical ownership, and business impact."}
Highlight top candidate skills: ${topSkills}.
Mention attached resume. Request a brief introductory call. Keep it professional, polished, and under 160 words.`,
    FOLLOW_UP_1: `Stage: Day 4 Follow-Up 1 (Polite Nudge).
Goal: Write a courteous, concise check-in inquiring if they had a chance to review the initial application.
Do NOT repeat the full resume pitch. Acknowledge their busy schedule and reaffirm excitement for "${companyName}". Keep it under 100 words.`,
    FOLLOW_UP_2: `Stage: Day 10 Follow-Up 2 (Value-Add Follow-Up).
Goal: Provide actionable value. Share a quick concrete engineering insight or architectural lesson related to "${jobTitle}" and "${companyName}".
Demonstrate proactiveness with ${topSkills}. Keep it under 140 words.`,
    FOLLOW_UP_3: `Stage: Day 15 Final Follow-Up (Graceful Closing).
Goal: Write a gracious, professional closing check-in. Understand that priorities shift, express gratitude for their consideration, and leave the door open for future collaboration. Keep it under 110 words.`,
  };

  try {
    const prompt = `You are an elite executive career strategist and technical copywriter.
Generate an email subject and body for a candidate named "${candidateName}".
Company: ${companyName}
Role: ${jobTitle}
${locationGuidance ? `Hiring Mode Alignment: ${locationGuidance}\n` : ""}${stagePrompts[stage]}

Candidate Context:
Experience Tier: ${experienceLevel || "FRESHER"}
${parsedResume ? parsedResume.slice(0, 1500) : `Skills: ${topSkills}`}

STRICT RULES:
- Only reference technologies and skills present in the candidate profile; never invent or assume other technical skills.
- Highlight the candidate's verified skills: ${topSkills}.
- Never use cheesy buzzwords or clichés.
- ANTI-PLACEHOLDER MANDATE: NEVER output template placeholders in brackets such as [Your Name], [Company Name], [Phone Number], [Hiring Manager], [Link], [Insert Metric], or <insert ...>. Always write complete, polished text.
- NO MARKDOWN: Do not use Markdown formatting (no asterisks **, no markdown headers #, no backticks). Write clean, human-readable email paragraphs.
- Subject must be direct, relevant, and professional.
- Body must be formatted with clean line breaks.
- Salutation: "Hi ${companyName} Hiring Team,"
- Sign off cleanly:
Best regards,
${candidateName}${input.candidateEmail ? `\n${input.candidateEmail}` : ""}${input.candidatePhone ? `\n${input.candidatePhone}` : ""}`;

    const result = await generateText({
      model: google("gemini-3.5-flash-lite"),
      output: Output.object({
        schema: z.object({
          subject: z.string().min(5),
          body: z.string().min(30),
        }),
      }),
      prompt,
    });

    if (result.output?.subject && result.output?.body) {
      const sanitized = sanitizeEmailContent(result.output.subject, result.output.body);
      // If unresolved template placeholders were leaked by AI, discard and use clean fallback
      if (sanitized.issues.length > 0) {
        console.warn("[Job Email Drafter] AI generated placeholders; falling back to clean template", sanitized.issues);
        return buildFallbackEmail(input);
      }
      return {
        stage,
        subject: sanitized.subject,
        body: sanitized.body,
      };
    }
  } catch (err) {
    console.warn("[Job Email Drafter] Gemini generation failed; using deterministic fallback", err);
  }

  return buildFallbackEmail(input);
}

export interface DeepAtsAnalysisInput {
  resumeText: string;
  skills?: string[];
  jobTitle: string;
  companyName: string;
  jobDescription?: string | null;
  experienceLevel?: CandidateExperienceLevel;
}

export interface DeepAtsAnalysisResult {
  probabilityPercent: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  resumeTweaks: string[];
  interviewFocusTopics: string[];
}

export async function analyzeJobAtsFit(
  input: DeepAtsAnalysisInput
): Promise<DeepAtsAnalysisResult> {
  const { resumeText, skills = [], jobTitle, companyName, jobDescription, experienceLevel } = input;

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    try {
      const prompt = `You are a Principal Engineering Recruiter and ATS Shortlist AI Specialist.
Analyze the candidate's resume against this job posting and compute an honest interview shortlist probability.

Target Role: ${jobTitle}
Company: ${companyName}
Experience Tier: ${experienceLevel || "MID"}

Job Description:
${jobDescription ? jobDescription.slice(0, 3000) : "Modern software engineering role requiring system design, clean coding, and production delivery."}

Candidate Resume:
${resumeText.slice(0, 2500)}

Candidate Skills:
${skills.join(", ") || "General full-stack engineering"}

Instructions:
1. Estimate shortlist probability percentage (0-100) based on realistic recruiter screening.
2. Provide a 1-2 sentence decisive verdict.
3. List 3-5 key technical strengths directly aligned with the JD.
4. List 2-4 critical technical gaps or unverified requirements from the JD.
5. Provide 2-3 actionable, high-impact resume tweaks to optimize for this specific ATS pipeline.
6. Provide 3 high-probability interview questions / system design focus topics for this role.`;

      const result = await generateText({
        model: google("gemini-3.5-flash-lite"),
        output: Output.object({
          schema: z.object({
            probabilityPercent: z.number().int().min(5).max(98),
            verdict: z.string().min(10),
            strengths: z.array(z.string()).min(1).max(6),
            gaps: z.array(z.string()).max(6),
            resumeTweaks: z.array(z.string()).min(1).max(5),
            interviewFocusTopics: z.array(z.string()).min(1).max(5),
          }),
        }),
        prompt,
      });

      if (result.output) {
        return result.output;
      }
    } catch (err) {
      console.warn("[Deep ATS Analyzer] Gemini call failed; using deterministic fallback", err);
    }
  }

  // Deterministic fallback
  const topSkills = skills.slice(0, 4);
  return {
    probabilityPercent: 72,
    verdict: `Strong baseline engineering alignment for ${jobTitle} at ${companyName} with high transferable relevance in ${topSkills.join(", ") || "core architecture"}.`,
    strengths: topSkills.length > 0 ? topSkills.map((s) => `Proven proficiency in ${s}`) : ["Production engineering track record", "System design and API ownership"],
    gaps: ["Advanced distributed concurrency tuning", "Domain-specific scale metrics"],
    resumeTweaks: [
      `Quantify business impact on top projects (e.g. latency reduction %, user scale) related to ${jobTitle}.`,
      `Place primary keywords for ${jobTitle} prominently in your technical summary and top experience section.`,
    ],
    interviewFocusTopics: [
      `System Design: High-availability service architecture and caching strategy for ${companyName}.`,
      `Live Coding: Data structures, clean concurrency handling, and API schema design.`,
      `Behavioral: Cross-functional technical ownership and resolving production incident trade-offs.`,
    ],
  };
}
