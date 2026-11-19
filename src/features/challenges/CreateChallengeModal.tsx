"use client";

import { useState } from "react";
import { X, Trophy } from "lucide-react";
import { Button, inputCls, selectCls } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { triggerLightImpact, triggerSuccessNotification } from "@/lib/haptics";
import { toast } from "sonner";

const categories = ["FITNESS", "LEARNING", "HEALTH", "PERSONAL_DEVELOPMENT", "OTHER"] as const;

export default function CreateChallengeModal({
  onClose,
  onCreated,
  today,
}: {
  onClose: () => void;
  onCreated: () => void;
  today: string;
}) {
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("FITNESS");
  const [unit, setUnit] = useState("steps");
  const [target, setTarget] = useState<string>("100000");
  const [startDate, setStartDate] = useState(today);

  // Default end date is 30 days from today
  const defaultEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numTarget = Number(target);
    if (isNaN(numTarget) || numTarget <= 0) {
      toast.error("Please enter a valid positive target number.");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date must be on or after start date.");
      return;
    }

    setBusy(true);
    triggerLightImpact();
    try {
      await api("/api/challenges", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category: category || null,
          unit: unit.trim() || null,
          target: numTarget,
          startDate,
          endDate,
        }),
      });
      triggerSuccessNotification();
      toast.success("Team challenge created! Let's hit the goal together.");
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create challenge.");
    } finally {
      setBusy(false);
    }
  };

  const lblCls = "mb-1 block text-xs font-medium text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-full bg-brand/10 text-brand">
              <Trophy size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">New Workspace Challenge</h2>
              <p className="text-xs text-muted">Create a shared goal for your organization.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-muted hover:bg-soft hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className={lblCls} htmlFor="c-title">Challenge Title</label>
            <input
              id="c-title"
              required
              maxLength={100}
              className={inputCls}
              placeholder="e.g. 1,000,000 Steps in November"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className={lblCls} htmlFor="c-desc">Description (optional)</label>
            <textarea
              id="c-desc"
              rows={2}
              maxLength={500}
              className={`${inputCls} resize-none`}
              placeholder="Tell your team what this challenge is about..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lblCls} htmlFor="c-cat">Category</label>
              <select
                id="c-cat"
                className={selectCls}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={lblCls} htmlFor="c-unit">Unit (e.g. steps, mins)</label>
              <input
                id="c-unit"
                className={inputCls}
                placeholder="steps"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={lblCls} htmlFor="c-target">Shared Target Value</label>
            <input
              id="c-target"
              type="number"
              required
              min={1}
              step="any"
              className={inputCls}
              placeholder="100000"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lblCls} htmlFor="c-start">Start Date</label>
              <input
                id="c-start"
                type="date"
                required
                className={inputCls}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className={lblCls} htmlFor="c-end">End Date</label>
              <input
                id="c-end"
                type="date"
                required
                className={inputCls}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Launch Challenge"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
