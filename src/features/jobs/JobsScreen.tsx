"use client";

import { useEffect, useState } from "react";
import {
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Globe,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { Button, Card, inputCls } from "@/components/ui";
import {
  CATEGORY_LABELS,
  COMPANY_CATEGORIES,
  type CompanyCategory,
} from "@/lib/domain/jobs";

interface Company {
  id: string;
  name: string;
  category: string;
  hrEmail: string;
  websiteUrl?: string | null;
  location?: string | null;
  description?: string | null;
  lastRefreshedAt: string;
}

interface JobApplication {
  id: string;
  jobTitle: string;
  jobUrl?: string | null;
  hrEmail: string;
  stage: string;
  appliedAt?: string | null;
  nextActionAt?: string | null;
  emailThreadId?: string | null;
  autoSend: boolean;
  logs?: Array<{
    action: string;
    stage?: string;
    subject?: string;
    body?: string;
    dispatchedAt?: string;
    timestamp?: string;
    note?: string;
  }> | null;
  company: Company;
  createdAt: string;
}

interface ApplicationCounts {
  toApply: number;
  followUp1: number;
  followUp2: number;
  followUp3: number;
  replied: number;
  closed: number;
}

interface UserResume {
  id: string;
  fileUrl: string;
  parsedText: string;
  skillsJson: string[];
  updatedAt: string;
}

interface EmailDraft {
  subject: string;
  body: string;
  stage: string;
}

export default function JobsScreen() {
  const [activeTab, setActiveTab] = useState<"APPLY" | "FU1" | "FU2" | "FU3" | "REPLIED">("APPLY");
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [counts, setCounts] = useState<ApplicationCounts>({
    toApply: 0,
    followUp1: 0,
    followUp2: 0,
    followUp3: 0,
    replied: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState<UserResume | null>(null);

  // Filters & selection
  const [selectedCategories, setSelectedCategories] = useState<CompanyCategory[]>([
    "STARTUP",
    "BIG_MNC",
    "BIG_SHARKS",
    "ACTIVELY_HIRING",
  ]);
  const [globalAutoSend, setGlobalAutoSend] = useState(false);
  const [queueing, setQueueing] = useState(false);

  // Modals / Drawers
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeInputText, setResumeInputText] = useState("");
  const [savingResume, setSavingResume] = useState(false);

  // Email Drawer / Modal
  const [selectedAppForEmail, setSelectedAppForEmail] = useState<JobApplication | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Reply Modal
  const [replyAppId, setReplyAppId] = useState<string | null>(null);
  const [replyNote, setReplyNote] = useState("");
  const [savingReply, setSavingReply] = useState(false);

  useEffect(() => {
    loadResume();
    loadApplications();
  }, []);

  async function loadResume() {
    try {
      const res = await fetch("/api/jobs/resume");
      if (res.ok) {
        const data = await res.json();
        setResume(data.resume);
        if (data.resume?.parsedText) {
          setResumeInputText(data.resume.parsedText);
        }
      }
    } catch (err) {
      console.warn("Failed to load resume", err);
    }
  }

  async function loadApplications() {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/applications");
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        if (data.counts) {
          setCounts(data.counts);
        }
      }
    } catch (err) {
      console.error("Failed to load applications", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleQueueJobs() {
    if (selectedCategories.length === 0) {
      alert("Please check at least one company category.");
      return;
    }
    setQueueing(true);
    try {
      const res = await fetch("/api/jobs/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: selectedCategories, limit: 5 }),
      });
      if (res.ok) {
        await loadApplications();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to queue jobs");
      }
    } catch (err) {
      console.error("Failed to queue jobs", err);
    } finally {
      setQueueing(false);
    }
  }

  async function handleSaveResume(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeInputText.trim()) return;

    setSavingResume(true);
    try {
      const res = await fetch("/api/jobs/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: resumeInputText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setResume(data.resume);
        setShowResumeModal(false);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to parse resume");
      }
    } catch (err) {
      console.error("Failed to save resume", err);
    } finally {
      setSavingResume(false);
    }
  }

  async function handleOpenEmailDrawer(app: JobApplication) {
    setSelectedAppForEmail(app);
    setLoadingDraft(true);
    setEmailDraft(null);

    try {
      const res = await fetch(`/api/jobs/applications/${app.id}/draft`);
      if (res.ok) {
        const data = await res.json();
        setEmailDraft(data.draft);
      }
    } catch (err) {
      console.error("Failed to load draft", err);
    } finally {
      setLoadingDraft(false);
    }
  }

  async function handleSendEmailFromDrawer() {
    if (!selectedAppForEmail || !emailDraft) return;

    setSendingEmail(true);
    try {
      let url = "";
      let body: Record<string, string> = {
        subject: emailDraft.subject,
        body: emailDraft.body,
      };

      if (selectedAppForEmail.stage === "TO_APPLY") {
        url = `/api/jobs/applications/${selectedAppForEmail.id}/apply`;
      } else {
        url = `/api/jobs/applications/${selectedAppForEmail.id}/follow-up`;
        let targetStage = "FOLLOW_UP_1";
        if (selectedAppForEmail.stage === "FOLLOW_UP_2" || selectedAppForEmail.stage === "WAITING_FU2") {
          targetStage = "FOLLOW_UP_2";
        } else if (selectedAppForEmail.stage === "FOLLOW_UP_3" || selectedAppForEmail.stage === "WAITING_FU3") {
          targetStage = "FOLLOW_UP_3";
        }
        body.stage = targetStage;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSelectedAppForEmail(null);
        await loadApplications();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to dispatch email");
      }
    } catch (err) {
      console.error("Failed to send email", err);
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleLogReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyAppId) return;

    setSavingReply(true);
    try {
      const res = await fetch(`/api/jobs/applications/${replyAppId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: replyNote.trim() }),
      });
      if (res.ok) {
        setReplyAppId(null);
        setReplyNote("");
        await loadApplications();
      }
    } catch (err) {
      console.error("Failed to log reply", err);
    } finally {
      setSavingReply(false);
    }
  }

  async function handleToggleAutoSend(app: JobApplication) {
    const newVal = !app.autoSend;
    try {
      const res = await fetch(`/api/jobs/applications/${app.id}/auto-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSend: newVal }),
      });
      if (res.ok) {
        setApplications((prev) =>
          prev.map((a) => (a.id === app.id ? { ...a, autoSend: newVal } : a))
        );
      }
    } catch (err) {
      console.error("Failed to toggle auto-send", err);
    }
  }

  function toggleCategory(cat: CompanyCategory) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  // Filter applications by active tab
  const now = new Date();
  const filteredApps = applications.filter((app) => {
    if (activeTab === "APPLY") {
      return app.stage === "TO_APPLY";
    }
    if (activeTab === "FU1") {
      return (
        app.stage === "FOLLOW_UP_1" ||
        (app.stage === "WAITING_FU1" && app.nextActionAt && new Date(app.nextActionAt) <= now)
      );
    }
    if (activeTab === "FU2") {
      return (
        app.stage === "FOLLOW_UP_2" ||
        (app.stage === "WAITING_FU2" && app.nextActionAt && new Date(app.nextActionAt) <= now)
      );
    }
    if (activeTab === "FU3") {
      return (
        app.stage === "FOLLOW_UP_3" ||
        (app.stage === "WAITING_FU3" && app.nextActionAt && new Date(app.nextActionAt) <= now)
      );
    }
    if (activeTab === "REPLIED") {
      return app.stage === "REPLIED" || app.stage === "CLOSED";
    }
    return false;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Automated Job Engine</h1>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand border border-brand/20 shrink-0">
              4-Stage Follow-Up Shifter
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Intelligent job application dispatch and automated shifting timeline: Day 0 Apply → Day 4 Follow-Up 1 → Day 10 Follow-Up 2 → Day 15 Final Follow-Up.
          </p>
        </div>

        {/* Top Action Pill Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Resume Upload Pill */}
          <Button
            variant="outline"
            onClick={() => setShowResumeModal(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 text-xs"
          >
            <FileText size={15} className="text-brand shrink-0" />
            <span>{resume ? `Resume: ${resume.skillsJson?.length || 0} Skills` : "Upload Resume"}</span>
          </Button>

          {/* Mode Indicator Toggle */}
          <button
            type="button"
            onClick={() => setGlobalAutoSend(!globalAutoSend)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
              globalAutoSend
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-soft text-muted hover:text-fg border-border"
            }`}
          >
            <Zap size={14} className={globalAutoSend ? "text-emerald-500" : "text-muted"} />
            <span>{globalAutoSend ? "Mode: Auto-Send" : "Mode: Review & Approve"}</span>
          </button>

          {/* Queue Jobs Button */}
          <Button
            disabled={queueing}
            onClick={handleQueueJobs}
            className="flex items-center gap-1.5 py-1.5 px-3 text-xs"
          >
            {queueing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            <span>Find & Queue Jobs</span>
          </Button>
        </div>
      </div>

      {/* Category Checkboxes Bar */}
      <Card className="border border-border/80 p-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Filter size={14} /> Target Company Categories (7 Channels)
          </div>
          <span className="text-xs text-muted">
            {selectedCategories.length} of 7 active
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {COMPANY_CATEGORIES.map((cat) => {
            const checked = selectedCategories.includes(cat);
            const isStartup = cat === "STARTUP";
            return (
              <label
                key={cat}
                onClick={(e) => {
                  e.preventDefault();
                  toggleCategory(cat);
                }}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-all ${
                  checked
                    ? "border-brand bg-brand/5 text-fg font-medium shadow-sm"
                    : "border-border/60 bg-card text-muted hover:bg-soft"
                }`}
              >
                <div
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors ${
                    checked ? "bg-brand text-brandfg border-brand" : "border-border bg-card"
                  }`}
                >
                  {checked && <Check size={12} strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="leading-snug">
                    <span className="line-clamp-2 font-medium leading-tight text-xs">
                      {CATEGORY_LABELS[cat].split("(")[0].trim()}
                    </span>
                  </div>
                  {isStartup && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ⚡ 2-Day Refresh
                    </span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </Card>

      {/* 4-Tab Shifting Pipeline Navigation */}
      <div className="border-b border-border/80 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max space-x-1 sm:space-x-2 pb-px">
          {/* Tab 1 */}
          <button
            onClick={() => setActiveTab("APPLY")}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "APPLY"
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:border-border hover:text-fg"
            }`}
          >
            <span>1. Apply</span>
            <span
              className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-bold ${
                activeTab === "APPLY" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
              }`}
            >
              {counts.toApply}
            </span>
          </button>

          {/* Tab 2 */}
          <button
            onClick={() => setActiveTab("FU1")}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "FU1"
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:border-border hover:text-fg"
            }`}
          >
            <span className="hidden sm:inline">2. Follow-Up 1 (Day 4)</span>
            <span className="sm:hidden">2. FU 1 (Day 4)</span>
            <span
              className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-bold ${
                activeTab === "FU1" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
              }`}
            >
              {counts.followUp1}
            </span>
          </button>

          {/* Tab 3 */}
          <button
            onClick={() => setActiveTab("FU2")}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "FU2"
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:border-border hover:text-fg"
            }`}
          >
            <span className="hidden sm:inline">3. Follow-Up 2 (Day 10)</span>
            <span className="sm:hidden">3. FU 2 (Day 10)</span>
            <span
              className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-bold ${
                activeTab === "FU2" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
              }`}
            >
              {counts.followUp2}
            </span>
          </button>

          {/* Tab 4 */}
          <button
            onClick={() => setActiveTab("FU3")}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "FU3"
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:border-border hover:text-fg"
            }`}
          >
            <span className="hidden sm:inline">4. Follow-Up 3 (Day 15)</span>
            <span className="sm:hidden">4. FU 3 (Day 15)</span>
            <span
              className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-bold ${
                activeTab === "FU3" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
              }`}
            >
              {counts.followUp3}
            </span>
          </button>

          {/* Tab 5 (Replied & Closed) */}
          <button
            onClick={() => setActiveTab("REPLIED")}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "REPLIED"
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:border-border hover:text-fg"
            }`}
          >
            <span className="hidden sm:inline">Replied & Closed</span>
            <span className="sm:hidden">Replied</span>
            <span
              className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-bold ${
                activeTab === "REPLIED" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
              }`}
            >
              {counts.replied + counts.closed}
            </span>
          </button>
        </div>
      </div>

      {/* Main Pipeline Application Cards List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-brand" />
        </div>
      ) : filteredApps.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-soft p-4 text-muted">
            <Inbox size={32} />
          </div>
          <h2 className="text-lg font-semibold">No Applications in this Stage</h2>
          <p className="mt-1 max-w-sm text-xs text-muted">
            {activeTab === "APPLY"
              ? "Click 'Find & Queue Jobs' above to populate opportunities matching your selected company categories."
              : "Applications automatically advance to this tab as their shifting follow-up timeline elapses (Day 4, Day 10, Day 15)."}
          </p>
          {activeTab === "APPLY" && (
            <Button onClick={handleQueueJobs} disabled={queueing} className="mt-5 flex items-center gap-2 py-1.5 px-3 text-xs">
              {queueing && <Loader2 size={14} className="animate-spin" />}
              <span>Queue New Opportunities</span>
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredApps.map((app) => {
            const isToApply = app.stage === "TO_APPLY";
            const isReplied = app.stage === "REPLIED";
            const isClosed = app.stage === "CLOSED";

            return (
              <Card
                key={app.id}
                className="border border-border/80 p-4 sm:p-5 transition-all hover:border-border overflow-hidden"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Job Details */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                        {app.company.category}
                      </span>
                      {app.company.location && (
                        <span className="text-xs text-muted">· {app.company.location}</span>
                      )}
                      {app.stage.startsWith("WAITING") && (
                        <span className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <Clock size={11} /> Waiting for schedule window
                        </span>
                      )}
                      {isReplied && (
                        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={11} /> HR Replied
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-bold sm:text-lg break-words">{app.jobTitle}</h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-fg break-words">{app.company.name}</span>
                      <span>·</span>
                      <span className="font-mono text-muted break-all sm:break-normal">{app.hrEmail}</span>
                      {app.company.websiteUrl && (
                        <a
                          href={app.company.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-brand hover:underline"
                        >
                          <Globe size={12} /> Website
                        </a>
                      )}
                    </div>

                    {/* Timeline Info */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                      {app.appliedAt && (
                        <span>Applied: {new Date(app.appliedAt).toLocaleDateString()}</span>
                      )}
                      {app.nextActionAt && !isReplied && !isClosed && (
                        <span className="font-medium text-brand">
                          Next Action: {new Date(app.nextActionAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Toggles */}
                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end shrink-0">
                    <div className="flex items-center gap-2">
                      {/* Auto-Send Checkbox per app */}
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={app.autoSend}
                          onChange={() => handleToggleAutoSend(app)}
                          className="rounded border-border accent-brand"
                        />
                        <span>Auto-Send</span>
                      </label>

                      {/* Preview / Send Email */}
                      {!isReplied && !isClosed && (
                        <Button
                          variant="outline"
                          onClick={() => handleOpenEmailDrawer(app)}
                          className="flex items-center gap-1.5 py-1 px-3 text-xs"
                        >
                          <Eye size={13} />
                          <span>Preview Draft</span>
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {/* Mark Reply button */}
                      {!isReplied && !isClosed && !isToApply && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setReplyAppId(app.id);
                            setReplyNote("");
                          }}
                          className="flex items-center gap-1.5 py-1 px-2.5 text-xs text-emerald-600 dark:text-emerald-400"
                        >
                          <MessageSquare size={13} />
                          <span>HR Replied</span>
                        </Button>
                      )}

                      {/* Primary Action Button */}
                      {!isReplied && !isClosed && (
                        <Button
                          onClick={() => handleOpenEmailDrawer(app)}
                          className="flex items-center gap-1.5 py-1 px-3 text-xs"
                        >
                          <Send size={13} />
                          <span>
                            {isToApply
                              ? "Apply Now"
                              : app.stage.includes("1")
                              ? "Send FU 1"
                              : app.stage.includes("2")
                              ? "Send FU 2"
                              : "Send Final FU"}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Log snippet if available */}
                {app.logs && app.logs.length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-2 text-[11px] text-muted">
                    <span className="font-semibold">Latest activity:</span>{" "}
                    {app.logs.at(-1)?.action} · {new Date(app.logs.at(-1)?.dispatchedAt || app.logs.at(-1)?.timestamp || Date.now()).toLocaleString()}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Resume Upload / Update Modal */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Candidate Resume & Skills</h2>
            <p className="mt-1 text-xs text-muted">
              Paste your resume or engineering profile text. The parser extracts core technical skills and structures AI email context.
            </p>

            <form onSubmit={handleSaveResume} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  Resume Content / Professional Summary
                </label>
                <textarea
                  required
                  rows={10}
                  placeholder="Paste your resume work history, technical stack (e.g. TypeScript, React, PostgreSQL, Docker, AWS), and project achievements..."
                  value={resumeInputText}
                  onChange={(e) => setResumeInputText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              {resume?.skillsJson && resume.skillsJson.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted mb-1.5">Detected Skills:</div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {resume.skillsJson.map((skill, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-soft px-2 py-0.5 text-[10px] font-semibold text-muted border border-border/50"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowResumeModal(false)}
                  className="py-1.5 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingResume}
                  className="flex items-center gap-2 py-1.5 px-3 text-xs"
                >
                  {savingResume && <Loader2 size={14} className="animate-spin" />}
                  <span>Save & Extract Skills</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Email Preview & Approval Drawer / Modal */}
      {selectedAppForEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                  {selectedAppForEmail.stage === "TO_APPLY"
                    ? "Day 0 Application"
                    : selectedAppForEmail.stage.includes("1")
                    ? "Day 4 Follow-Up 1"
                    : selectedAppForEmail.stage.includes("2")
                    ? "Day 10 Follow-Up 2"
                    : "Day 15 Final Follow-Up"}
                </span>
                <h2 className="mt-1.5 text-lg font-bold">
                  {selectedAppForEmail.jobTitle} · {selectedAppForEmail.company.name}
                </h2>
                <div className="text-xs text-muted">Recipient: {selectedAppForEmail.hrEmail}</div>
              </div>
              <button
                onClick={() => setSelectedAppForEmail(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-soft"
              >
                <X size={18} />
              </button>
            </div>

            {loadingDraft ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
                <Loader2 className="size-8 animate-spin text-brand" />
                <span className="text-xs text-muted">AI is tailoring non-repetitive email copy...</span>
              </div>
            ) : emailDraft ? (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Subject Line</label>
                  <input
                    type="text"
                    value={emailDraft.subject}
                    onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Email Body</label>
                  <textarea
                    rows={11}
                    value={emailDraft.body}
                    onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })}
                    className="w-full rounded-xl border border-border bg-bg p-3 font-sans text-xs leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-border/60 pt-4">
                  <button
                    type="button"
                    onClick={() => handleOpenEmailDrawer(selectedAppForEmail)}
                    className="flex items-center gap-1.5 text-xs text-brand hover:underline"
                  >
                    <Sparkles size={14} /> Regenerate with AI
                  </button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedAppForEmail(null)}
                      className="py-1.5 px-3 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={sendingEmail}
                      onClick={handleSendEmailFromDrawer}
                      className="flex items-center gap-2 py-1.5 px-3 text-xs"
                    >
                      {sendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      <span>Dispatch Email</span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {/* Log HR Reply Modal */}
      {replyAppId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Log HR Response</h2>
            <p className="mt-1 text-xs text-muted">
              Logging an HR response pauses and cancels all automated follow-up sequences immediately.
            </p>

            <form onSubmit={handleLogReply} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  Response Notes / Next Steps
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. HR reached out to schedule technical screen on Thursday at 2 PM."
                  value={replyNote}
                  onChange={(e) => setReplyNote(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg p-3 text-xs leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReplyAppId(null)}
                  className="py-1.5 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingReply}
                  className="flex items-center gap-2 py-1.5 px-3 text-xs"
                >
                  {savingReply && <Loader2 size={14} className="animate-spin" />}
                  <span>Save & Stop Sequences</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
