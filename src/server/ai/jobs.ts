import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { CandidateExperienceLevel } from "@/lib/domain/jobs";

export interface EmailDraftInput {
  stage: "APPLY" | "FOLLOW_UP_1" | "FOLLOW_UP_2" | "FOLLOW_UP_3";
  candidateName: string;
  jobTitle: string;
  companyName: string;
  hrEmail: string;
  parsedResume?: string;
  skills?: string[];
  experienceLevel?: CandidateExperienceLevel;
}

export interface EmailDraft {
  subject: string;
  body: string;
  stage: string;
}

export function buildFallbackEmail(input: EmailDraftInput): EmailDraft {
  const { stage, candidateName, jobTitle, companyName, skills, experienceLevel } = input;
  const topSkills = skills && skills.length > 0 ? skills.slice(0, 4).join(", ") : "modern full-stack engineering, scalable architecture, and TypeScript";
  const isFresher = experienceLevel === "FRESHER";

  switch (stage) {
    case "APPLY":
      return {
        stage,
        subject: `Application: ${jobTitle} - ${candidateName}`,
        body: isFresher
          ? [
              `Hi Hiring Team at ${companyName},`,
              "",
              `I am writing to express my enthusiastic interest in the ${jobTitle} position at ${companyName}. As an aspiring software engineer with solid foundations in ${topSkills}, I have built performant, resilient applications and am eager to bring fresh energy and fast adaptability to your team.`,
              "",
              `Given ${companyName}'s trajectory and engineering standards, I would love to contribute my problem-solving ability, dedication, and technical curiosity to your product roadmap.`,
              "",
              `I have attached my resume for your review. Would you be open to a brief 15-minute conversation this week to discuss how my background aligns with your team's goals?`,
              "",
              `Best regards,`,
              `${candidateName}`,
            ].join("\n")
          : [
              `Hi Hiring Team at ${companyName},`,
              "",
              `I am writing to express my strong interest in the ${jobTitle} position at ${companyName}. With deep hands-on expertise in ${topSkills}, I have consistently built resilient, high-performance systems that drive measurable business impact.`,
              "",
              `Given ${companyName}'s trajectory and engineering standards, I am eager to contribute my problem-solving ability and technical rigor to your product roadmap.`,
              "",
              `I have attached my resume for your review. Would you be open to a brief 15-minute conversation this week to discuss how my background aligns with your team's goals?`,
              "",
              `Best regards,`,
              `${candidateName}`,
            ].join("\n"),
      };

    case "FOLLOW_UP_1":
      return {
        stage,
        subject: `Following up: ${jobTitle} role - ${candidateName}`,
        body: [
          `Hi Hiring Team at ${companyName},`,
          "",
          `I wanted to quickly follow up on my application submitted earlier this week for the ${jobTitle} role.`,
          "",
          `I understand you receive many qualified candidates and are actively balancing multiple priorities. I remain very enthusiastic about the work being done at ${companyName} and would love to connect whenever your schedule permits.`,
          "",
          `Thank you for your time and consideration!`,
          "",
          `Best regards,`,
          `${candidateName}`,
        ].join("\n"),
      };

    case "FOLLOW_UP_2":
      return {
        stage,
        subject: `Re: ${jobTitle} at ${companyName} - Additional context & project insights`,
        body: [
          `Hi Hiring Team at ${companyName},`,
          "",
          `I hope you are having a productive week.`,
          "",
          `While following ${companyName}'s recent developments, I was reflecting on common technical hurdles in scaling ${jobTitle} workflows—specifically around database optimization, offline state synchronization, and reliable background jobs.`,
          "",
          `In my recent work, I spearheaded improvements using ${topSkills} that reduced query latency by 40% and fortified resilient user workflows. I would love to bring this same proactive ownership to your engineering team.`,
          "",
          `Please let me know if there are any additional materials or project links I can share to assist in your review.`,
          "",
          `Warm regards,`,
          `${candidateName}`,
        ].join("\n"),
      };

    case "FOLLOW_UP_3":
      return {
        stage,
        subject: `Final follow-up regarding ${jobTitle} position - ${candidateName}`,
        body: [
          `Hi Hiring Team at ${companyName},`,
          "",
          `I wanted to reach out with one final check-in regarding the ${jobTitle} opportunity at ${companyName}.`,
          "",
          `I recognize that hiring plans and bandwidth shift dynamically. If the position has already been filled or priorities have pivoted, no worries at all.`,
          "",
          `Thank you sincerely for considering my background. I wish ${companyName} continued growth and success, and I would love to stay in touch for future opportunities down the road.`,
          "",
          `Warm regards,`,
          `${candidateName}`,
        ].join("\n"),
      };
  }
}

export async function generateJobEmailDraft(input: EmailDraftInput): Promise<EmailDraft> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return buildFallbackEmail(input);
  }

  const { stage, candidateName, jobTitle, companyName, parsedResume, skills, experienceLevel } = input;
  const topSkills = skills && skills.length > 0 ? skills.slice(0, 5).join(", ") : "full-stack development";
  const isFresher = experienceLevel === "FRESHER";

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
${stagePrompts[stage]}

Candidate Context:
Experience Tier: ${experienceLevel || "FRESHER"}
${parsedResume ? parsedResume.slice(0, 1500) : `Skills: ${topSkills}`}

STRICT RULES:
- Never use cheesy buzzwords or clichés.
- Subject must be direct, relevant, and professional.
- Body must be formatted with clean line breaks.
- Sign off with candidate name "${candidateName}".`;

    const result = await generateObject({
      model: google("gemini-3.5-flash-lite"),
      schema: z.object({
        subject: z.string().min(5),
        body: z.string().min(30),
      }),
      prompt,
    });

    if (result.object?.subject && result.object?.body) {
      return {
        stage,
        subject: result.object.subject.trim(),
        body: result.object.body.trim(),
      };
    }
  } catch (err) {
    console.warn("[Job Email Drafter] Gemini generation failed; using deterministic fallback", err);
  }

  return buildFallbackEmail(input);
}
