"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
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
  GraduationCap,
  Inbox,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
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
  CANDIDATE_EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  EXPERIENCE_LEVEL_SHORT_LABELS,
  inferExperienceLevelFromTitle,
  type CompanyCategory,
  type CandidateExperienceLevel,
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
    experienceLevel?: string;
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

  // Experience level & Profile
  const [candidateExperience, setCandidateExperience] = useState<CandidateExperienceLevel>("FRESHER");
  const [experienceFilter, setExperienceFilter] = useState<CandidateExperienceLevel | "ALL">("ALL");
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  const [selectedExpChoice, setSelectedExpChoice] = useState<CandidateExperienceLevel>("FRESHER");
  const [savingExperience, setSavingExperience] = useState(false);

  // Filters & selection
  const [selectedCategories, setSelectedCategories] = useState<CompanyCategory[]>([
    "STARTUP",
    "BIG_MNC",
    "BIG_SHARKS",
    "ACTIVELY_HIRING",
    "MID_MNC",
    "SMALL_SCALE",
    "FOREIGN",
  ]);
  const [globalAutoSend, setGlobalAutoSend] = useState(false);
  const [queueing, setQueueing] = useState(false);

  // Modals / Drawers
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidateEmailInput, setCandidateEmailInput] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [showResumeModal, setShowResumeModal] = useState(false);
  const [uploadTab, setUploadTab] = useState<"file" | "text">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resumeInputText, setResumeInputText] = useState("");
  const [savingResume, setSavingResume] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
    loadCandidateProfile();
    loadResume();
    loadApplications();
  }, []);

  async function loadCandidateProfile() {
    try {
      const res = await fetch("/api/jobs/profile");
      if (res.ok) {
        const data = await res.json();
        if (data.profile?.email) {
          setCandidateEmail(data.profile.email);
          setCandidateEmailInput(data.profile.email);
        }
        if (data.profile?.experienceLevel) {
          setCandidateExperience(data.profile.experienceLevel);
          setSelectedExpChoice(data.profile.experienceLevel);
        }
      }
    } catch (err) {
      console.warn("Failed to load candidate email/profile", err);
    }
  }

  async function handleSaveCandidateEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateEmailInput.trim()) return;
    setSavingEmail(true);
    try {
      const res = await fetch("/api/jobs/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: candidateEmailInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCandidateEmail(data.email || candidateEmailInput.trim());
        setShowEmailModal(false);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to save email");
      }
    } catch (err) {
      console.error("Failed to save candidate email", err);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSaveCandidateExperience() {
    setSavingExperience(true);
    try {
      const res = await fetch("/api/jobs/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceLevel: selectedExpChoice }),
      });
      if (res.ok) {
        setCandidateExperience(selectedExpChoice);
        setShowExperienceModal(false);
        // Refresh opportunities matching this experience level
        await handleQueueJobsWithExp(selectedExpChoice);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to update experience level");
      }
    } catch (err) {
      console.error("Failed to update experience level", err);
    } finally {
      setSavingExperience(false);
    }
  }

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

  async function handleQueueJobsWithExp(exp?: CandidateExperienceLevel) {
    if (selectedCategories.length === 0) {
      alert("Please check at least one company category.");
      return;
    }
    setQueueing(true);
    try {
      const res = await fetch("/api/jobs/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selectedCategories,
          experienceLevel: exp || candidateExperience,
        }),
      });
      if (res.ok) {
        await loadApplications();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to refresh 2-day hiring batch");
      }
    } catch (err) {
      console.error("Failed to queue jobs", err);
    } finally {
      setQueueing(false);
    }
  }

  function handleFileSelect(file: File) {
    if (!file) return;
    const validExts = [".pdf", ".doc", ".docx", ".txt", ".md"];
    const hasValidExt = validExts.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExt) {
      alert("Please select a valid resume document (.pdf, .doc, .docx, or .txt)");
      return;
    }
    setSelectedFile(file);
  }

  async function handleUploadResumeDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      alert("Please select a resume file (.pdf, .doc, .docx, .txt)");
      return;
    }

    setSavingResume(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/jobs/resume", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setResume(data.resume);
        if (data.resume?.parsedText) {
          setResumeInputText(data.resume.parsedText);
        }
        setShowResumeModal(false);
        setSelectedFile(null);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to parse uploaded resume document");
      }
    } catch (err) {
      console.error("Failed to upload resume document", err);
      alert("Network error while uploading resume document");
    } finally {
      setSavingResume(false);
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
    if (!resume || !resume.parsedText?.trim()) {
      setShowResumeModal(true);
      alert("Please upload your resume document first before applying to jobs.");
      return;
    }

    if (!candidateEmail) {
      setShowEmailModal(true);
      alert("Please set your candidate contact email first so recruiters can reach you.");
      return;
    }

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

  // Filter applications by active tab and experience filter
  const now = new Date();
  const filteredApps = applications.filter((app) => {
    // 1. Stage filter
    let stageMatch = false;
    if (activeTab === "APPLY") {
      stageMatch = app.stage === "TO_APPLY";
    } else if (activeTab === "FU1") {
      stageMatch =
        app.stage === "FOLLOW_UP_1" ||
        (app.stage === "WAITING_FU1" && !!app.nextActionAt && new Date(app.nextActionAt) <= now);
    } else if (activeTab === "FU2") {
      stageMatch =
        app.stage === "FOLLOW_UP_2" ||
        (app.stage === "WAITING_FU2" && !!app.nextActionAt && new Date(app.nextActionAt) <= now);
    } else if (activeTab === "FU3") {
      stageMatch =
        app.stage === "FOLLOW_UP_3" ||
        (app.stage === "WAITING_FU3" && !!app.nextActionAt && new Date(app.nextActionAt) <= now);
    } else if (activeTab === "REPLIED") {
      stageMatch = app.stage === "REPLIED" || app.stage === "CLOSED";
    }

    if (!stageMatch) return false;

    // 2. Experience level filter
    if (experienceFilter !== "ALL") {
      const appExp = inferExperienceLevelFromTitle(app.jobTitle);
      if (appExp !== experienceFilter) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Candidate Job Application Engine</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 border border-brand/20 px-2.5 py-0.5 text-xs font-semibold text-brand">
            4-Stage Follow-Up Shifter
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            ⚡ 2-Day Auto-Rotation
          </span>
        </div>
        <p className="text-xs sm:text-sm text-muted max-w-4xl leading-relaxed">
          Outreach and scheduled follow-up pipeline curated for your experience level. Applied companies advance through <strong>Day 0 Apply</strong> → <strong>Day 4 Follow-Up 1</strong> → <strong>Day 10 Follow-Up 2</strong> → <strong>Day 15 Final Follow-Up</strong>.
        </p>
      </div>

      {/* 2. Candidate Profile & Readiness Dashboard Bar */}
      <Card className="border border-border/80 bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Profile Metrics & Config Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            {/* Sender Email Card */}
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                candidateEmail ? "border-border bg-soft/50" : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    candidateEmail ? "bg-brand/10 text-brand" : "bg-amber-500/10 text-amber-500"
                  }`}
                >
                  <Mail size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted">Sender Email (Reply-To)</div>
                  <div className="font-semibold text-xs truncate text-fg">
                    {candidateEmail || "Not Configured"}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowEmailModal(true)}
                className="h-7 text-xs px-2.5 shrink-0"
              >
                {candidateEmail ? "Edit" : "Set Email"}
              </Button>
            </div>

            {/* Resume Document Card */}
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                resume ? "border-border bg-soft/50" : "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    resume ? "bg-brand/10 text-brand" : "bg-blue-500/10 text-blue-500"
                  }`}
                >
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted">Resume Document</div>
                  <div className="font-semibold text-xs truncate text-fg">
                    {resume?.fileUrl ? resume.fileUrl.split("/").pop() : resume ? `${resume.skillsJson?.length || 0} Skills Parsed` : "Not Uploaded"}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowResumeModal(true)}
                className="h-7 text-xs px-2.5 shrink-0"
              >
                {resume ? "Replace" : "Upload"}
              </Button>
            </div>

            {/* Experience Level Card */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-soft/50 p-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <GraduationCap size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted">Experience Level</div>
                  <div className="font-semibold text-xs truncate text-fg">
                    {EXPERIENCE_LEVEL_SHORT_LABELS[candidateExperience] || "Fresher (0-1 Yrs)"}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedExpChoice(candidateExperience);
                  setShowExperienceModal(true);
                }}
                className="h-7 text-xs px-2.5 shrink-0"
              >
                Change
              </Button>
            </div>
          </div>

          {/* Action Group: Mode + Refresh */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0 lg:border-l lg:border-border/60 lg:pl-4 shrink-0">
            {/* Auto-Send Mode Toggle */}
            <button
              type="button"
              onClick={() => setGlobalAutoSend(!globalAutoSend)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                globalAutoSend
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-soft text-muted hover:text-fg border-border"
              }`}
            >
              <Zap size={14} className={globalAutoSend ? "text-emerald-500" : "text-muted"} />
              <span>{globalAutoSend ? "Mode: Auto-Send" : "Mode: Review & Approve"}</span>
            </button>

            {/* 2-Day Batch Refresh Button */}
            <Button
              disabled={queueing}
              onClick={() => handleQueueJobsWithExp()}
              className="flex items-center gap-1.5 py-2 px-3.5 text-xs font-semibold shadow-sm"
            >
              {queueing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>⚡ 2-Day Batch Refresh</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. Company Categories Bar (Balanced Responsive Grid) */}
      <Card className="border border-border/80 p-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Filter size={14} /> Target Company Categories (7 Channels · ⚡ 2-Day Refresh for All)
          </div>
          <span className="text-xs text-muted">
            {selectedCategories.length} of 7 active
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {COMPANY_CATEGORIES.map((cat) => {
            const checked = selectedCategories.includes(cat);
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
                    <span className="font-semibold text-xs leading-tight text-fg">
                      {CATEGORY_LABELS[cat]}
                    </span>
                  </div>
                  <span className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    ⚡ 2-Day Refresh
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </Card>

      {/* 4. Pipeline Navigation & Experience Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-2">
        {/* Shifting Stage Tabs */}
        <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab("APPLY")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "APPLY"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:border-border hover:text-fg"
              }`}
            >
              <span>1. Apply</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  activeTab === "APPLY" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
                }`}
              >
                {counts.toApply}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("FU1")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "FU1"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:border-border hover:text-fg"
              }`}
            >
              <span className="hidden sm:inline">2. Follow-Up 1 (Day 4)</span>
              <span className="sm:hidden">2. FU 1 (Day 4)</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  activeTab === "FU1" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
                }`}
              >
                {counts.followUp1}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("FU2")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "FU2"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:border-border hover:text-fg"
              }`}
            >
              <span className="hidden sm:inline">3. Follow-Up 2 (Day 10)</span>
              <span className="sm:hidden">3. FU 2 (Day 10)</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  activeTab === "FU2" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
                }`}
              >
                {counts.followUp2}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("FU3")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "FU3"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:border-border hover:text-fg"
              }`}
            >
              <span className="hidden sm:inline">4. Follow-Up 3 (Day 15)</span>
              <span className="sm:hidden">4. FU 3 (Day 15)</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  activeTab === "FU3" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
                }`}
              >
                {counts.followUp3}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("REPLIED")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "REPLIED"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:border-border hover:text-fg"
              }`}
            >
              <span className="hidden sm:inline">Replied & Closed</span>
              <span className="sm:hidden">Replied</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  activeTab === "REPLIED" ? "bg-brand/15 text-brand" : "bg-soft text-muted"
                }`}
              >
                {counts.replied + counts.closed}
              </span>
            </button>
          </div>
        </div>

        {/* Experience Level Quick Filter Selector */}
        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-[11px] font-medium text-muted shrink-0 mr-1">Experience:</span>
          <button
            type="button"
            onClick={() => setExperienceFilter("ALL")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              experienceFilter === "ALL"
                ? "bg-brand text-brandfg"
                : "bg-soft text-muted hover:text-fg"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setExperienceFilter("FRESHER")}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              experienceFilter === "FRESHER"
                ? "bg-emerald-600 text-white"
                : "bg-soft text-muted hover:text-fg"
            }`}
          >
            🎓 Fresher
          </button>
          <button
            type="button"
            onClick={() => setExperienceFilter("JUNIOR")}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              experienceFilter === "JUNIOR"
                ? "bg-sky-600 text-white"
                : "bg-soft text-muted hover:text-fg"
            }`}
          >
            💼 1-3 Yrs
          </button>
          <button
            type="button"
            onClick={() => setExperienceFilter("MID")}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              experienceFilter === "MID"
                ? "bg-indigo-600 text-white"
                : "bg-soft text-muted hover:text-fg"
            }`}
          >
            🚀 3-5 Yrs
          </button>
          <button
            type="button"
            onClick={() => setExperienceFilter("SENIOR")}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              experienceFilter === "SENIOR"
                ? "bg-amber-600 text-white"
                : "bg-soft text-muted hover:text-fg"
            }`}
          >
            ⭐ 5+ Yrs
          </button>
        </div>
      </div>

      {/* 5. Main Application Cards Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-brand" />
        </div>
      ) : filteredApps.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-soft p-4 text-muted">
            <Inbox size={32} />
          </div>
          <h2 className="text-lg font-semibold">No Applications Found</h2>
          <p className="mt-1 max-w-sm text-xs text-muted">
            {activeTab === "APPLY"
              ? "Click '⚡ 2-Day Batch Refresh' above to curate opportunities matching your selected experience level and company categories."
              : "Applications automatically advance to this tab as their shifting follow-up timeline elapses (Day 4, Day 10, Day 15)."}
          </p>
          {activeTab === "APPLY" && (
            <Button
              onClick={() => handleQueueJobsWithExp()}
              disabled={queueing}
              className="mt-5 flex items-center gap-2 py-1.5 px-3.5 text-xs font-semibold"
            >
              {queueing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>⚡ 2-Day Batch Refresh</span>
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredApps.map((app) => {
            const isToApply = app.stage === "TO_APPLY";
            const isReplied = app.stage === "REPLIED";
            const isClosed = app.stage === "CLOSED";
            const isFollowUpStage = !isToApply && !isReplied && !isClosed;
            const isLocked = isFollowUpStage && app.nextActionAt ? new Date(app.nextActionAt) > now : false;
            const daysRemaining = isLocked && app.nextActionAt
              ? Math.max(1, Math.ceil((new Date(app.nextActionAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
              : 0;

            const expLevel = inferExperienceLevelFromTitle(app.jobTitle);

            return (
              <Card
                key={app.id}
                className="flex flex-col justify-between border border-border/80 bg-card p-4 sm:p-5 transition-all hover:border-brand/40 hover:shadow-sm"
              >
                <div className="space-y-3">
                  {/* Badges Header */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                        {CATEGORY_LABELS[app.company.category as CompanyCategory] || app.company.category}
                      </span>

                      {/* Experience Tier Badge */}
                      {expLevel === "FRESHER" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <GraduationCap size={12} /> Fresher (0-1 Yrs)
                        </span>
                      ) : expLevel === "JUNIOR" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                          <Briefcase size={12} /> 1-3 Years
                        </span>
                      ) : expLevel === "MID" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                          <Zap size={12} /> 3-5 Years
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <ShieldCheck size={12} /> 5+ Years Senior
                        </span>
                      )}
                    </div>

                    {/* Stage Status Flag */}
                    {isLocked ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        <Lock size={11} /> Locked ({daysRemaining}d)
                      </span>
                    ) : isFollowUpStage ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Zap size={11} /> Ready
                      </span>
                    ) : isReplied ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={11} /> Replied
                      </span>
                    ) : null}
                  </div>

                  {/* Role Title & Company Details */}
                  <div>
                    <h3 className="text-base font-bold text-fg sm:text-lg leading-snug break-words">
                      {app.jobTitle}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="font-semibold text-fg">{app.company.name}</span>
                      <span>·</span>
                      {app.company.location && <span>{app.company.location}</span>}
                      {app.company.websiteUrl && (
                        <>
                          <span>·</span>
                          <a
                            href={app.company.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-brand hover:underline"
                          >
                            <Globe size={11} /> Site
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Recruiter Email Address */}
                  <div className="flex items-center gap-2 rounded-lg bg-soft/60 px-2.5 py-1.5 text-xs text-muted border border-border/50">
                    <Mail size={13} className="text-brand shrink-0" />
                    <span className="font-mono text-[11px] truncate">{app.hrEmail}</span>
                  </div>

                  {/* Description */}
                  {app.company.description && (
                    <p className="text-xs text-muted leading-relaxed line-clamp-2">
                      {app.company.description}
                    </p>
                  )}

                  {/* Timeline / Action Dates */}
                  {(app.appliedAt || app.nextActionAt) && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted pt-1 border-t border-border/50">
                      {app.appliedAt && <span>Applied: {new Date(app.appliedAt).toLocaleDateString()}</span>}
                      {app.nextActionAt && !isReplied && !isClosed && (
                        <span className="font-medium text-brand">
                          {isLocked ? "Unlocks:" : "Target:"} {new Date(app.nextActionAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Actions Row */}
                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  {/* Auto-Send toggle */}
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted select-none">
                    <input
                      type="checkbox"
                      checked={app.autoSend}
                      onChange={() => handleToggleAutoSend(app)}
                      className="rounded border-border accent-brand size-3.5"
                    />
                    <span className="text-[11px]">Auto-Send</span>
                  </label>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    {!isReplied && !isClosed && (
                      <Button
                        variant="outline"
                        onClick={() => handleOpenEmailDrawer(app)}
                        className="h-8 text-xs px-2.5"
                      >
                        <Eye size={12} className="mr-1" /> Preview
                      </Button>
                    )}

                    {!isReplied && !isClosed && !isToApply && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReplyAppId(app.id);
                          setReplyNote("");
                        }}
                        className="h-8 text-xs px-2 text-emerald-600 dark:text-emerald-400"
                      >
                        <MessageSquare size={12} className="mr-1" /> Replied
                      </Button>
                    )}

                    {!isReplied && !isClosed && (
                      isToApply ? (
                        !resume ? (
                          <Button
                            onClick={() => setShowResumeModal(true)}
                            className="h-8 text-xs px-2.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 font-semibold"
                          >
                            <Upload size={12} className="mr-1" /> Resume
                          </Button>
                        ) : !candidateEmail ? (
                          <Button
                            onClick={() => setShowEmailModal(true)}
                            className="h-8 text-xs px-2.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 font-semibold"
                          >
                            <Mail size={12} className="mr-1" /> Email
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleOpenEmailDrawer(app)}
                            className="h-8 text-xs px-3 font-semibold"
                          >
                            <Send size={12} className="mr-1" /> Apply Now
                          </Button>
                        )
                      ) : isLocked ? (
                        <Button
                          disabled
                          className="h-8 text-xs px-2.5 opacity-60 cursor-not-allowed bg-soft text-muted border border-border"
                        >
                          <Lock size={12} className="mr-1" /> Locked ({daysRemaining}d)
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleOpenEmailDrawer(app)}
                          className="h-8 text-xs px-3 bg-brand text-brandfg hover:bg-brand/90 font-semibold"
                        >
                          <Send size={12} className="mr-1" />
                          {app.stage.includes("1")
                            ? "Send FU 1"
                            : app.stage.includes("2")
                            ? "Send FU 2"
                            : "Send Final FU"}
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Experience Level Configuration Modal */}
      {showExperienceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="text-lg font-bold">Select Your Experience Level</h2>
                <p className="text-xs text-muted">
                  Your experience level determines which job opportunities are curated for you (Freshers vs Experienced) and tailors your AI email pitch.
                </p>
              </div>
              <button
                onClick={() => setShowExperienceModal(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-soft"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* Option 1: FRESHER */}
              <div
                onClick={() => setSelectedExpChoice("FRESHER")}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                  selectedExpChoice === "FRESHER"
                    ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                    : "border-border/80 bg-soft/40 hover:border-border hover:bg-soft"
                }`}
              >
                <div
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                    selectedExpChoice === "FRESHER"
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border bg-card"
                  }`}
                >
                  {selectedExpChoice === "FRESHER" && <Check size={12} strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-fg">
                    <GraduationCap size={16} className="text-emerald-500" />
                    <span>Fresher (0 - 1 Years / Entry Level)</span>
                  </div>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    Designed for university graduates, campus placements, interns, and entry-level developers. Opportunities prioritize Graduate Software Engineer, Associate SDE, and Trainee roles across all 7 company categories.
                  </p>
                </div>
              </div>

              {/* Option 2: JUNIOR */}
              <div
                onClick={() => setSelectedExpChoice("JUNIOR")}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                  selectedExpChoice === "JUNIOR"
                    ? "border-sky-500 bg-sky-500/10 shadow-sm"
                    : "border-border/80 bg-soft/40 hover:border-border hover:bg-soft"
                }`}
              >
                <div
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                    selectedExpChoice === "JUNIOR"
                      ? "border-sky-500 bg-sky-500 text-white"
                      : "border-border bg-card"
                  }`}
                >
                  {selectedExpChoice === "JUNIOR" && <Check size={12} strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-fg">
                    <Briefcase size={16} className="text-sky-500" />
                    <span>1 - 3 Years (Junior / Associate SDE)</span>
                  </div>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    For candidates with 1 to 3 years of software engineering experience. Curated for SDE-1, Junior Full-Stack Engineer, and Backend Integration roles.
                  </p>
                </div>
              </div>

              {/* Option 3: MID */}
              <div
                onClick={() => setSelectedExpChoice("MID")}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                  selectedExpChoice === "MID"
                    ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                    : "border-border/80 bg-soft/40 hover:border-border hover:bg-soft"
                }`}
              >
                <div
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                    selectedExpChoice === "MID"
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : "border-border bg-card"
                  }`}
                >
                  {selectedExpChoice === "MID" && <Check size={12} strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-fg">
                    <Zap size={16} className="text-indigo-500" />
                    <span>3 - 5 Years (Mid-Level SDE)</span>
                  </div>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    For developers with 3 to 5 years of industry experience. Curated for SDE-2, Senior Backend Engineer, and Distributed Systems Developer openings.
                  </p>
                </div>
              </div>

              {/* Option 4: SENIOR */}
              <div
                onClick={() => setSelectedExpChoice("SENIOR")}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                  selectedExpChoice === "SENIOR"
                    ? "border-amber-500 bg-amber-500/10 shadow-sm"
                    : "border-border/80 bg-soft/40 hover:border-border hover:bg-soft"
                }`}
              >
                <div
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                    selectedExpChoice === "SENIOR"
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-border bg-card"
                  }`}
                >
                  {selectedExpChoice === "SENIOR" && <Check size={12} strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-fg">
                    <ShieldCheck size={16} className="text-amber-500" />
                    <span>5+ Years (Senior / Tech Lead / Staff)</span>
                  </div>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    For seasoned engineers and tech leads. Curated for Senior Staff Software Engineer, Systems Architect, and Engineering Lead roles.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowExperienceModal(false)}
                className="py-1.5 px-3 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={savingExperience}
                onClick={handleSaveCandidateExperience}
                className="flex items-center gap-2 py-1.5 px-4 text-xs font-semibold"
              >
                {savingExperience && <Loader2 size={14} className="animate-spin" />}
                <span>Save Experience & Update Jobs</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Candidate Contact Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="text-lg font-bold">Candidate Contact Email</h2>
                <p className="text-xs text-muted">
                  Companies and HR recruiters will reply directly to this email address.
                </p>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-soft"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCandidateEmail} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  Your Professional Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. yourname.engineer@gmail.com"
                  value={candidateEmailInput}
                  onChange={(e) => setCandidateEmailInput(e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
                  Every application email dispatched to HR recruiters will include this address in the <strong>Reply-To</strong> header. When the company responds, the email lands directly in your private personal inbox.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEmailModal(false)}
                  className="py-1.5 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingEmail || !candidateEmailInput.trim()}
                  className="flex items-center gap-2 py-1.5 px-3 text-xs font-semibold"
                >
                  {savingEmail && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Contact Email</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Resume Upload / Update Modal */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="text-lg font-bold">Candidate Resume Document</h2>
                <p className="text-xs text-muted">
                  Upload your resume in PDF, DOC, DOCX, or TXT format. We extract your skills and attach the file when applying.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowResumeModal(false);
                  setSelectedFile(null);
                }}
                className="rounded-lg p-1.5 text-muted hover:bg-soft"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab switch: File Upload vs Text Paste */}
            <div className="mt-4 flex border-b border-border">
              <button
                type="button"
                onClick={() => setUploadTab("file")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all ${
                  uploadTab === "file"
                    ? "border-brand text-brand"
                    : "border-transparent text-muted hover:text-fg"
                }`}
              >
                <Upload size={14} /> Upload Document (PDF / DOC)
              </button>
              <button
                type="button"
                onClick={() => setUploadTab("text")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all ${
                  uploadTab === "text"
                    ? "border-brand text-brand"
                    : "border-transparent text-muted hover:text-fg"
                }`}
              >
                <FileText size={14} /> Paste Text Manually
              </button>
            </div>

            {uploadTab === "file" ? (
              <form onSubmit={handleUploadResumeDocument} className="mt-4 space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                    dragActive
                      ? "border-brand bg-brand/5 scale-[1.01]"
                      : "border-border/80 bg-soft/40 hover:border-brand/60 hover:bg-soft"
                  }`}
                >
                  <input
                    type="file"
                    id="resume-file-input"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <div className="mb-2 rounded-full bg-brand/10 p-3 text-brand">
                    <Upload size={24} />
                  </div>
                  <p className="text-xs font-semibold text-fg">
                    Drag and drop your resume document, or <span className="text-brand underline">browse</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    Supports PDF, DOC, DOCX, and TXT (up to 10MB)
                  </p>
                </div>

                {selectedFile && (
                  <div className="flex items-center justify-between rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText size={18} className="text-brand shrink-0" />
                      <div className="min-w-0 truncate">
                        <div className="font-semibold text-fg truncate">{selectedFile.name}</div>
                        <div className="text-[10px] text-muted">
                          {(selectedFile.size / 1024).toFixed(1)} KB · Ready to parse
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-1 text-muted hover:text-fg"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}

                {resume?.fileUrl && !selectedFile && (
                  <div className="flex items-center gap-2 rounded-lg bg-soft p-2.5 text-xs text-muted border border-border/60">
                    <Paperclip size={14} className="text-brand shrink-0" />
                    <span className="truncate">
                      Current active file: <strong className="text-fg">{resume.fileUrl.split("/").pop()}</strong>
                    </span>
                  </div>
                )}

                {resume?.skillsJson && resume.skillsJson.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted mb-1.5">Parsed Skills:</div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {resume.skillsJson.map((skill, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand border border-brand/20"
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
                    onClick={() => {
                      setShowResumeModal(false);
                      setSelectedFile(null);
                    }}
                    className="py-1.5 px-3 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingResume || !selectedFile}
                    className="flex items-center gap-2 py-1.5 px-3.5 text-xs font-semibold"
                  >
                    {savingResume && <Loader2 size={14} className="animate-spin" />}
                    <span>Upload & Extract Skills</span>
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveResume} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5">
                    Resume Content / Professional Summary
                  </label>
                  <textarea
                    required
                    rows={8}
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
                    className="flex items-center gap-2 py-1.5 px-3.5 text-xs font-semibold"
                  >
                    {savingResume && <Loader2 size={14} className="animate-spin" />}
                    <span>Save & Extract Skills</span>
                  </Button>
                </div>
              </form>
            )}
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
                {/* Sender & Recipient Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-soft/70 p-2.5 border border-border/60">
                    <span className="text-[10px] uppercase font-semibold text-muted block">
                      From / Reply-To (Your Private Inbox)
                    </span>
                    <span className="font-semibold text-fg break-all">
                      {candidateEmail || "No candidate email configured"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-soft/70 p-2.5 border border-border/60">
                    <span className="text-[10px] uppercase font-semibold text-muted block">
                      To (Company Recruiter)
                    </span>
                    <span className="font-semibold text-fg break-all">
                      {selectedAppForEmail.hrEmail}
                    </span>
                  </div>
                </div>

                {/* Resume Attachment Info */}
                <div className="flex items-center justify-between rounded-xl bg-soft/70 px-3 py-2 text-xs border border-border/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip size={14} className="text-brand shrink-0" />
                    <span className="truncate">
                      Resume Attachment: <strong className="text-fg">{resume?.fileUrl ? resume.fileUrl.split("/").pop() : "Candidate_Resume.pdf"}</strong>
                    </span>
                  </div>
                  <span className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                    Attached for Day 0
                  </span>
                </div>

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
                      className="flex items-center gap-2 py-1.5 px-3.5 text-xs font-semibold"
                    >
                      {sendingEmail && <Loader2 size={14} className="animate-spin" />}
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
                  className="flex items-center gap-2 py-1.5 px-3.5 text-xs font-semibold"
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
