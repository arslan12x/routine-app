"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Calendar,
  Check,
  Copy,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button, Card, inputCls } from "@/components/ui";

interface BlogDay {
  id: string;
  dayNumber: number;
  title: string;
  subtopicsJson: {
    subtopics?: string[];
    summaryGoal?: string;
  };
  markdownContent?: string | null;
  status: string;
}

interface BlogPlan {
  id: string;
  topic: string;
  totalDays: number;
  tone: string;
  targetAudience: string;
  createdAt: string;
  days: BlogDay[];
}

export default function BlogsScreen() {
  const [plans, setPlans] = useState<BlogPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generatingDay, setGeneratingDay] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState("");
  const [copied, setCopied] = useState(false);

  // Form state
  const [topic, setTopic] = useState("");
  const [totalDays, setTotalDays] = useState(5);
  const [tone, setTone] = useState("Professional");
  const [targetAudience, setTargetAudience] = useState("Software Engineers");

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const res = await fetch("/api/blogs");
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        if (data.plans?.length > 0 && !selectedPlanId) {
          setSelectedPlanId(data.plans[0].id);
          loadPlanDetails(data.plans[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load blog plans", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlanDetails(planId: string) {
    try {
      const res = await fetch(`/api/blogs/${planId}`);
      if (res.ok) {
        const data = await res.json();
        setPlans((prev) =>
          prev.map((p) => (p.id === planId ? { ...p, ...data.plan } : p))
        );
        const day = data.plan.days?.find((d: BlogDay) => d.dayNumber === selectedDayNumber);
        if (day?.markdownContent) {
          setEditedMarkdown(day.markdownContent);
        }
      }
    } catch (err) {
      console.error("Failed to load plan details", err);
    }
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const currentDay = selectedPlan?.days?.find((d) => d.dayNumber === selectedDayNumber);

  useEffect(() => {
    if (currentDay?.markdownContent) {
      setEditedMarkdown(currentDay.markdownContent);
      setEditMode(false);
    }
  }, [currentDay?.id, selectedDayNumber]);

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/blogs/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          totalDays: Number(totalDays),
          tone,
          targetAudience,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlans((prev) => [data.plan, ...prev]);
        setSelectedPlanId(data.plan.id);
        setSelectedDayNumber(1);
        setShowCreateModal(false);
        setTopic("");
      } else {
        const error = await res.json();
        alert(error.error?.message || "Failed to create plan");
      }
    } catch (err) {
      console.error("Failed to create blog plan", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleGenerateDay(dayNum: number) {
    if (!selectedPlanId) return;
    setGeneratingDay(true);
    try {
      const res = await fetch(`/api/blogs/${selectedPlanId}/generate-day/${dayNum}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setPlans((prev) =>
          prev.map((plan) => {
            if (plan.id !== selectedPlanId) return plan;
            return {
              ...plan,
              days: plan.days.map((d) => (d.dayNumber === dayNum ? { ...d, ...data.day } : d)),
            };
          })
        );
        if (data.day.markdownContent) {
          setEditedMarkdown(data.day.markdownContent);
        }
      } else {
        const error = await res.json();
        alert(error.error?.message || "Failed to generate day content");
      }
    } catch (err) {
      console.error("Failed to generate day content", err);
    } finally {
      setGeneratingDay(false);
    }
  }

  async function handleSaveEditedMarkdown() {
    if (!selectedPlanId || !currentDay) return;
    setSavingEdit(true);
    try {
      const res = await fetch(
        `/api/blogs/${selectedPlanId}/days/${currentDay.dayNumber}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdownContent: editedMarkdown }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setPlans((prev) =>
          prev.map((plan) => {
            if (plan.id !== selectedPlanId) return plan;
            return {
              ...plan,
              days: plan.days.map((d) =>
                d.dayNumber === currentDay.dayNumber ? { ...d, ...data.day } : d
              ),
            };
          })
        );
        setEditMode(false);
      }
    } catch (err) {
      console.error("Failed to save edited markdown", err);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm("Are you sure you want to delete this blog series?")) return;
    try {
      const res = await fetch(`/api/blogs/${planId}`, { method: "DELETE" });
      if (res.ok) {
        const remaining = plans.filter((p) => p.id !== planId);
        setPlans(remaining);
        if (selectedPlanId === planId) {
          setSelectedPlanId(remaining[0]?.id || null);
          setSelectedDayNumber(1);
        }
      }
    } catch (err) {
      console.error("Failed to delete plan", err);
    }
  }

  function handleCopyMarkdown() {
    if (!currentDay?.markdownContent) return;
    navigator.clipboard.writeText(currentDay.markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Blog Content Generator</h1>
          <p className="text-sm text-muted">
            Plan and generate multi-day structured blog curriculums with seamless narrative continuity.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
          <Plus size={16} /> New Blog Series
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-brand" />
        </div>
      ) : plans.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-brand/10 p-4 text-brand">
            <Sparkles size={32} />
          </div>
          <h2 className="text-lg font-semibold">No Blog Series Yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Create your first multi-day blog plan. The AI breaks any topic into progressive daily outlines and generates full Markdown posts.
          </p>
          <Button onClick={() => setShowCreateModal(true)} className="mt-5 flex items-center gap-2">
            <Plus size={16} /> Create Series
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Series Sidebar */}
          <div className="space-y-2 lg:col-span-1">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
              Your Series ({plans.length})
            </h2>
            <div className="space-y-1.5">
              {plans.map((p) => {
                const isSelected = p.id === selectedPlanId;
                const genCount = p.days?.filter((d) => d.status === "GENERATED").length || 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPlanId(p.id);
                      setSelectedDayNumber(1);
                      loadPlanDetails(p.id);
                    }}
                    className={`group relative flex cursor-pointer flex-col rounded-xl p-3 text-left transition-all ${
                      isSelected
                        ? "bg-brand text-brandfg shadow-sm"
                        : "bg-card hover:bg-soft text-fg border border-border/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 font-medium text-sm leading-snug">{p.topic}</h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlan(p.id);
                        }}
                        className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400 ${
                          isSelected ? "text-brandfg/80" : "text-muted"
                        }`}
                        title="Delete series"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs opacity-80">
                      <span>{p.totalDays} Days</span>
                      <span>·</span>
                      <span>{genCount}/{p.totalDays} Done</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Plan Content and Timeline */}
          {selectedPlan && (
            <div className="space-y-6 lg:col-span-3">
              {/* Plan Metadata Card */}
              <Card className="border border-border/80 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                      <Sparkles size={12} /> {selectedPlan.tone} Tone · {selectedPlan.targetAudience}
                    </span>
                    <h2 className="mt-2 text-xl font-bold">{selectedPlan.topic}</h2>
                  </div>
                </div>

                {/* Day Stepper / Timeline */}
                <div className="mt-5 border-t border-border/60 pt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Curriculum Timeline
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedPlan.days?.map((d) => {
                      const isDaySelected = d.dayNumber === selectedDayNumber;
                      const isGenerated = d.status === "GENERATED";
                      return (
                        <button
                          key={d.dayNumber}
                          onClick={() => setSelectedDayNumber(d.dayNumber)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                            isDaySelected
                              ? "bg-brand text-brandfg shadow-sm"
                              : isGenerated
                              ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30"
                              : "bg-soft text-muted hover:text-fg border border-border"
                          }`}
                        >
                          {isGenerated && <Check size={12} />}
                          <span>Day {d.dayNumber}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>

              {/* Selected Day Workspace */}
              {currentDay && (
                <Card className="border border-border/80 p-6">
                  {/* Day Header */}
                  <div className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-brand">
                        Day {currentDay.dayNumber} of {selectedPlan.totalDays}
                      </div>
                      <h3 className="text-lg font-bold sm:text-xl">{currentDay.title}</h3>
                      {currentDay.subtopicsJson?.summaryGoal && (
                        <p className="mt-1 text-xs text-muted">
                          Goal: {currentDay.subtopicsJson.summaryGoal}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {currentDay.status === "GENERATED" && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => setEditMode(!editMode)}
                            className="flex items-center gap-1.5 py-1 px-3 text-xs"
                          >
                            {editMode ? <Eye size={14} /> : <Edit3 size={14} />}
                            <span>{editMode ? "Preview" : "Edit"}</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleCopyMarkdown}
                            className="flex items-center gap-1.5 py-1 px-3 text-xs"
                          >
                            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            <span>{copied ? "Copied!" : "Copy MD"}</span>
                          </Button>
                        </>
                      )}

                      <Button
                        disabled={generatingDay}
                        onClick={() => handleGenerateDay(currentDay.dayNumber)}
                        className="flex items-center gap-1.5 py-1 px-3 text-xs"
                      >
                        {generatingDay ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : currentDay.status === "GENERATED" ? (
                          <RefreshCw size={14} />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        <span>
                          {generatingDay
                            ? "Generating..."
                            : currentDay.status === "GENERATED"
                            ? "Regenerate"
                            : "Generate Content"}
                        </span>
                      </Button>
                    </div>
                  </div>

                  {/* Subtopics Outline Chips */}
                  {currentDay.subtopicsJson?.subtopics && currentDay.subtopicsJson.subtopics.length > 0 && (
                    <div className="my-4 flex flex-wrap gap-2">
                      {currentDay.subtopicsJson.subtopics.map((sub, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-md bg-soft px-2.5 py-1 text-xs text-muted border border-border/50"
                        >
                          • {sub}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Day Content Body */}
                  {currentDay.status !== "GENERATED" ? (
                    <div className="my-10 flex flex-col items-center justify-center py-10 text-center">
                      <div className="rounded-full bg-soft p-4 text-muted">
                        <FileText size={28} />
                      </div>
                      <h4 className="mt-3 font-semibold">Content Not Yet Generated</h4>
                      <p className="mt-1 max-w-md text-xs text-muted">
                        Click &ldquo;Generate Content&rdquo; above to create a fully tailored, multi-section Markdown post for Day {currentDay.dayNumber}.
                      </p>
                      <Button
                        disabled={generatingDay}
                        onClick={() => handleGenerateDay(currentDay.dayNumber)}
                        className="mt-4 flex items-center gap-2"
                      >
                        {generatingDay ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        <span>{generatingDay ? "Writing Article..." : "Generate Day Content"}</span>
                      </Button>
                    </div>
                  ) : editMode ? (
                    <div className="space-y-4 pt-2">
                      <textarea
                        value={editedMarkdown}
                        onChange={(e) => setEditedMarkdown(e.target.value)}
                        rows={22}
                        className="w-full rounded-xl border border-border bg-bg p-4 font-mono text-sm leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand"
                        placeholder="Write or edit Markdown here..."
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditMode(false)} className="py-1 px-3 text-xs">
                          Cancel
                        </Button>
                        <Button
                          disabled={savingEdit}
                          onClick={handleSaveEditedMarkdown}
                          className="flex items-center gap-1.5 py-1 px-3 text-xs"
                        >
                          {savingEdit && <Loader2 size={14} className="animate-spin" />}
                          <span>Save Changes</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-neutral dark:prose-invert max-w-none pt-4 text-sm leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {currentDay.markdownContent || ""}
                      </ReactMarkdown>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create New Series Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg border border-border bg-card p-6 shadow-2xl">
            <h2 className="text-xl font-bold">New Multi-Day Blog Series</h2>
            <p className="mt-1 text-xs text-muted">
              Configure your topic, duration, and target audience. The AI will formulate a progressive curriculum with zero topic overlap.
            </p>

            <form onSubmit={handleCreatePlan} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  Overarching Topic
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mastering Next.js Server Components & Caching"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5">
                    Series Duration (Days)
                  </label>
                  <select
                    value={totalDays}
                    onChange={(e) => setTotalDays(Number(e.target.value))}
                    className={inputCls}
                  >
                    <option value={3}>3 Days (Crash Course)</option>
                    <option value={5}>5 Days (Weekly Sprint)</option>
                    <option value={7}>7 Days (Full Week)</option>
                    <option value={10}>10 Days (Deep Dive)</option>
                    <option value={14}>14 Days (Two-Week Bootcamp)</option>
                    <option value={30}>30 Days (Mastery Month)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5">
                    Writing Tone
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className={inputCls}
                  >
                    <option value="Professional">Professional</option>
                    <option value="Conversational">Conversational</option>
                    <option value="Technical / Deep Dive">Technical / Deep Dive</option>
                    <option value="Storytelling">Storytelling</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  Target Audience
                </label>
                <input
                  type="text"
                  placeholder="e.g. Intermediate TypeScript Developers"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating} className="flex items-center gap-2">
                  {creating && <Loader2 size={16} className="animate-spin" />}
                  <span>{creating ? "Structuring Plan..." : "Generate Plan"}</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
