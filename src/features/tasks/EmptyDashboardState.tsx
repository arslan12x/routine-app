"use client";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { toast } from "sonner";

const templates = [
  {
    title: "Walk 10,000 steps",
    category: "FITNESS",
    target: 10_000,
    unit: "steps",
  },
  {
    title: "Read 10 pages",
    category: "LEARNING",
    target: 10,
    unit: "pages",
  },
] as const;

export default function EmptyDashboardState({ onCreated }: { onCreated: () => Promise<void> }) {
  const [creating, setCreating] = useState(false);

  async function addTemplate(template: (typeof templates)[number]) {
    setCreating(true);
    let created = false;
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: template.title,
          category: template.category,
          isMandatory: true,
          completionType: "MEASURABLE",
          target: template.target,
          unit: template.unit,
          recurrence: "DAILY",
          weekdays: [],
        }),
      });
      created = true;
      await onCreated();
      toast.success(`${template.title} added`);
    } catch (error) {
      console.error("[Tasks] Could not add quick-start task", error);
      toast.error(
        created
          ? "Task was created, but the dashboard could not refresh. Please reload the page."
          : "Could not add that task. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="mt-8 p-6 text-center">
      <div className="display text-2xl font-semibold">Start a small daily streak</div>
      <p className="mt-2 text-sm text-muted">Choose a quick start, or add a routine that is uniquely yours.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {templates.map((template) => (
          <Button
            key={template.title}
            type="button"
            disabled={creating}
            onClick={() => void addTemplate(template)}
          >
            Add: {template.title}
          </Button>
        ))}
      </div>
    </Card>
  );
}
