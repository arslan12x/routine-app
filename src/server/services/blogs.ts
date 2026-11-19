import { google } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";

if (typeof process !== "undefined" && process.env) {
  process.env.AI_SDK_LOG_WARNINGS = "false";
}
import { withUserDb } from "@/lib/db";
import { ApiError } from "@/lib/api";

export interface CreateBlogPlanInput {
  topic: string;
  totalDays: number;
  tone?: string;
  targetAudience?: string;
}

export function buildFallbackBlogPlan(topic: string, totalDays: number) {
  const progressionThemes = [
    { prefix: "Foundations & Core Principles", goal: "Establish basic terminology and foundational mental models." },
    { prefix: "Essential Mechanics & Deep Dive", goal: "Break down core architecture, syntax, and workflows." },
    { prefix: "Hands-on Implementation & Patterns", goal: "Walk through practical, real-world examples and step-by-step implementations." },
    { prefix: "Common Pitfalls & Best Practices", goal: "Analyze edge cases, anti-patterns, and pro tips to avoid mistakes." },
    { prefix: "Advanced Strategies & Optimization", goal: "Scale performance, explore advanced techniques, and optimize efficiency." },
    { prefix: "Real-World Architecture & Case Studies", goal: "Review industry production implementations and architectural trade-offs." },
    { prefix: "Future Trends & Master Capstone", goal: "Synthesize all concepts into a master project and discuss next horizons." },
  ];

  return Array.from({ length: totalDays }, (_, i) => {
    const dayNum = i + 1;
    const theme = progressionThemes[i % progressionThemes.length];
    const cycle = Math.floor(i / progressionThemes.length);
    const suffix = cycle > 0 ? ` (Part ${cycle + 1})` : "";

    return {
      dayNumber: dayNum,
      title: `Day ${dayNum}: ${theme.prefix} of ${topic}${suffix}`,
      subtopics: [
        `Core understanding of ${topic} for Day ${dayNum}`,
        `Practical walkthrough and actionable takeaways`,
        `Interactive exercises and real-world application`,
      ],
      summaryGoal: theme.goal,
    };
  });
}

export function buildFallbackMarkdown(
  topic: string,
  dayNumber: number,
  totalDays: number,
  title: string,
  subtopics: string[],
  previousSummary?: string
): string {
  return [
    `# ${title}`,
    "",
    `> **Series Progress:** Day ${dayNumber} of ${totalDays} · Exploring *${topic}*`,
    "",
    previousSummary ? `### Recap from Day ${dayNumber - 1}\nYesterday we covered key foundations: ${previousSummary}. Today, we take the next step in our journey.\n` : "",
    "## Overview",
    `Welcome to Day ${dayNumber} of our in-depth series on **${topic}**. In today's guide, we will unpack key insights and translate theory into actionable execution.`,
    "",
    ...subtopics.map((sub, idx) => [
      `### ${idx + 1}. ${sub}`,
      `When working with **${topic}**, mastering ${sub.toLowerCase()} allows you to navigate real-world challenges with confidence.`,
      "",
      "- **Key Concept:** Clear separation of concerns and deliberate implementation.",
      "- **Action Item:** Review your existing routine and identify where this pattern applies.",
      "",
    ].join("\n")),
    "## Key Takeaways",
    `- **Consistency:** Incremental progress daily compounds into mastery.`,
    `- **Practical Application:** Test what you learned in a sandbox or notebook.`,
    `- **Tomorrow's Horizon:** Prepare for the next phase of our curriculum.`,
    "",
    "---",
    `*Stay tuned for Day ${dayNumber + 1} as we continue exploring ${topic}!*`,
  ].join("\n");
}

export async function createBlogPlan(userId: string, input: CreateBlogPlanInput) {
  const topic = input.topic.trim();
  const totalDays = Math.min(Math.max(input.totalDays, 1), 30);
  const tone = input.tone?.trim() || "Professional";
  const targetAudience = input.targetAudience?.trim() || "General Audience";

  if (!topic) {
    throw new ApiError(400, "VALIDATION", "Topic is required");
  }

  let planDays: Array<{
    dayNumber: number;
    title: string;
    subtopics: string[];
    summaryGoal: string;
  }> = [];

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    try {
      const prompt = `You are an elite curriculum designer and professional technical writer.
Divide the overarching topic "${topic}" into a multi-day blog plan of exactly ${totalDays} daily articles.
Tone: ${tone}
Target Audience: ${targetAudience}

STRICT REQUIREMENTS:
1. Generate an array with exactly ${totalDays} items, numbered 1 to ${totalDays}.
2. Ensure strict logical progression: each day builds directly on the previous day.
3. No overlapping subtopics between days.
4. Each day must have a compelling title, 3-4 specific subtopics, and a 1-sentence summaryGoal explaining what the reader achieves.`;

      const result = await generateObject({
        model: google("gemini-3.5-flash-lite"),
        schema: z.object({
          days: z.array(
            z.object({
              dayNumber: z.number().int().min(1),
              title: z.string().min(5),
              subtopics: z.array(z.string().min(3)),
              summaryGoal: z.string(),
            })
          ),
        }),
        prompt,
      });

      if (result.object?.days && result.object.days.length === totalDays) {
        planDays = result.object.days;
      }
    } catch (err) {
      console.warn("[Blog Plan] Gemini generation failed; falling back to deterministic plan", err);
    }
  }

  if (planDays.length === 0) {
    planDays = buildFallbackBlogPlan(topic, totalDays);
  }

  return withUserDb(userId, async (tx) => {
    const plan = await tx.blogPlan.create({
      data: {
        userId,
        topic,
        totalDays,
        tone,
        targetAudience,
        days: {
          create: planDays.map((d) => ({
            dayNumber: d.dayNumber,
            title: d.title,
            subtopicsJson: { subtopics: d.subtopics, summaryGoal: d.summaryGoal },
            status: "PENDING",
          })),
        },
      },
      include: {
        days: {
          orderBy: { dayNumber: "asc" },
        },
      },
    });
    return plan;
  });
}

export async function listBlogPlans(userId: string) {
  return withUserDb(userId, (tx) =>
    tx.blogPlan.findMany({
      where: { userId },
      include: {
        days: {
          select: {
            id: true,
            dayNumber: true,
            title: true,
            status: true,
          },
          orderBy: { dayNumber: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })
  );
}

export async function getBlogPlan(userId: string, planId: string) {
  return withUserDb(userId, async (tx) => {
    const plan = await tx.blogPlan.findUnique({
      where: { id: planId },
      include: {
        days: {
          orderBy: { dayNumber: "asc" },
        },
      },
    });
    if (!plan || plan.userId !== userId) {
      throw new ApiError(404, "NOT_FOUND", "Blog plan not found");
    }
    return plan;
  });
}

export async function generateDayContent(userId: string, planId: string, dayNumber: number) {
  const plan = await getBlogPlan(userId, planId);
  const currentDay = plan.days.find((d) => d.dayNumber === dayNumber);
  if (!currentDay) {
    throw new ApiError(404, "NOT_FOUND", `Day ${dayNumber} not found in this plan`);
  }

  const subtopicsData = currentDay.subtopicsJson as { subtopics?: string[]; summaryGoal?: string } | null;
  const subtopics = subtopicsData?.subtopics || [];
  const summaryGoal = subtopicsData?.summaryGoal || "";

  // Get previous day context if available
  let previousContext = "";
  if (dayNumber > 1) {
    const prevDay = plan.days.find((d) => d.dayNumber === dayNumber - 1);
    if (prevDay) {
      const prevSubtopics = (prevDay.subtopicsJson as { subtopics?: string[]; summaryGoal?: string } | null)?.summaryGoal;
      previousContext = `Previous Day ${dayNumber - 1} was "${prevDay.title}". Goal/Summary: ${prevSubtopics || "Foundational concepts"}.`;
    }
  }

  let generatedMarkdown = "";

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    try {
      const prompt = `You are a world-class technical blogger and educator.
Write a comprehensive, publication-ready, beautifully formatted Markdown blog post for Day ${dayNumber} of ${plan.totalDays}.
Series Topic: ${plan.topic}
Day ${dayNumber} Title: ${currentDay.title}
Tone: ${plan.tone}
Target Audience: ${plan.targetAudience}
Key Subtopics to explore in depth:
${subtopics.map((s) => `- ${s}`).join("\n")}
Day Objective: ${summaryGoal}

${previousContext ? `Continuity Context:\n${previousContext}\nSmoothly bridge from yesterday's ideas into today's lessons.` : "This is Day 1 of the series. Hook the reader and establish foundational clarity."}

REQUIREMENTS:
- Format exclusively in GitHub-flavored Markdown.
- Include a strong H1 title matching "${currentDay.title}".
- Provide detailed, insightful explanations for each subtopic using H2 and H3 headings.
- Include code examples, ASCII/mermaid diagrams, or concrete scenarios where relevant.
- End with a 'Key Takeaways & Daily Practice' section.`;

      const result = await generateText({
        model: google("gemini-3.5-flash-lite"),
        prompt,
      });

      if (result.text?.trim()) {
        generatedMarkdown = result.text.trim();
      }
    } catch (err) {
      console.warn(`[Blog Content] Gemini generation failed for day ${dayNumber}; falling back`, err);
    }
  }

  if (!generatedMarkdown) {
    generatedMarkdown = buildFallbackMarkdown(
      plan.topic,
      dayNumber,
      plan.totalDays,
      currentDay.title,
      subtopics,
      previousContext
    );
  }

  return withUserDb(userId, async (tx) => {
    return tx.blogDayContent.update({
      where: {
        planId_dayNumber: {
          planId,
          dayNumber,
        },
      },
      data: {
        markdownContent: generatedMarkdown,
        status: "GENERATED",
      },
    });
  });
}

export async function updateDayMarkdown(
  userId: string,
  planId: string,
  dayNumber: number,
  markdownContent: string
) {
  // Check ownership
  await getBlogPlan(userId, planId);

  return withUserDb(userId, (tx) =>
    tx.blogDayContent.update({
      where: {
        planId_dayNumber: {
          planId,
          dayNumber,
        },
      },
      data: {
        markdownContent,
        status: "GENERATED",
      },
    })
  );
}

export async function deleteBlogPlan(userId: string, planId: string) {
  await getBlogPlan(userId, planId);
  return withUserDb(userId, (tx) => tx.blogPlan.delete({ where: { id: planId } }));
}
