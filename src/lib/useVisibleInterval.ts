"use client";
import { useEffect, useRef } from "react";

export function useVisibleInterval(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible" && navigator.onLine) callbackRef.current();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(run, intervalMs);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}
