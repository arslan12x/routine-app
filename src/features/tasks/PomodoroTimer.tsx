"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";
import {
  cancelPomodoroNotification,
  playChime,
  requestNotificationPermission,
  schedulePomodoroNotification,
} from "@/lib/notifications";
import { triggerLightImpact, triggerSuccessNotification } from "@/lib/haptics";
import { toast } from "sonner";

const POMODORO_DURATION = 25 * 60; // 25 minutes in seconds

export default function PomodoroTimer() {
  const [timeLeft, setTimeLeft] = useState(POMODORO_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = async () => {
    await requestNotificationPermission();
    triggerLightImpact();
    setIsRunning(true);
    void schedulePomodoroNotification(
      timeLeft,
      "Focus sprint finished! 🎯",
      "Great job! Your 25-minute Pomodoro session is complete. Take a 5-minute break.",
    );
  };

  const pauseTimer = () => {
    triggerLightImpact();
    setIsRunning(false);
    void cancelPomodoroNotification();
  };

  const resetTimer = () => {
    triggerLightImpact();
    setIsRunning(false);
    setTimeLeft(POMODORO_DURATION);
    void cancelPomodoroNotification();
  };

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          triggerSuccessNotification();
          playChime();
          toast.success("Focus sprint completed! Take a 5-minute break. 🎉");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  // Cleanup scheduled notification on unmount
  useEffect(() => {
    return () => {
      void cancelPomodoroNotification();
    };
  }, []);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const progressPct = ((POMODORO_DURATION - timeLeft) / POMODORO_DURATION) * 100;

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-soft/80 px-2.5 py-1 text-xs shadow-xs backdrop-blur-xs sm:gap-3 sm:px-3 sm:py-1.5">
      <div className="flex items-center gap-1.5 text-muted">
        <Timer size={14} className={isRunning ? "animate-pulse text-brand" : "text-muted"} aria-hidden />
        <span className="hidden text-[11px] font-medium tracking-wide uppercase sm:inline">Pomodoro</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex items-center font-mono text-sm font-semibold tabular-nums text-foreground">
          {formattedTime}
          {isRunning && (
            <span
              className="absolute -bottom-1 left-0 h-0.5 rounded-full bg-brand transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          {isRunning ? (
            <button
              type="button"
              onClick={pauseTimer}
              title="Pause focus timer"
              aria-label="Pause focus timer"
              className="grid size-6 place-items-center rounded-full text-muted hover:bg-card hover:text-foreground active:scale-95 transition"
            >
              <Pause size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={startTimer}
              title="Start 25-minute focus sprint"
              aria-label="Start 25-minute focus sprint"
              className="grid size-6 place-items-center rounded-full bg-brand/10 text-brand hover:bg-brand hover:text-brandfg active:scale-95 transition"
            >
              <Play size={12} fill="currentColor" />
            </button>
          )}

          <button
            type="button"
            onClick={resetTimer}
            title="Reset timer"
            aria-label="Reset timer"
            className="grid size-6 place-items-center rounded-full text-muted hover:bg-card hover:text-foreground active:scale-95 transition"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
