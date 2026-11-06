"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/fetcher";

/** On first visit, store the device's IANA timezone so "today" is computed correctly on the server. */
export default function TimezoneSync({ isSet }: { isSet: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (isSet) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    api("/api/me/settings", { method: "PATCH", body: JSON.stringify({ timezone }) }).then(() => router.refresh()).catch(() => {});
  }, [isSet, router]);
  return null;
}
