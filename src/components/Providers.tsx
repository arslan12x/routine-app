"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useEffect, type ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}
