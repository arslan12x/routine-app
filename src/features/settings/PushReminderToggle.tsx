"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/fetcher";

function decodeApplicationServerKey(encoded: string): Uint8Array<ArrayBuffer> {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export default function PushReminderToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setInitialized(true);
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      setMessage("Push reminders are available on the deployed app.");
      setInitialized(true);
      return;
    }
    setSupported(true);
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEnabled(subscription !== null))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not check notification settings."))
      .finally(() => setInitialized(true));
  }, []);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      if (enabled) {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await api("/api/me/push-subscriptions", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: existing.endpoint }),
          });
          await existing.unsubscribe();
        }
        setEnabled(false);
        setMessage("Reminders are off on this device.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser settings to enable reminders.");
      const { publicKey } = await api<{ publicKey: string | null }>("/api/me/push-subscriptions");
      if (!publicKey) throw new Error("Push reminders are not configured on the server.");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(publicKey),
      });
      await api("/api/me/push-subscriptions", {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      });
      setEnabled(true);
      setMessage("Reminders are enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update notification settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 space-y-3 text-sm">
      <div className="font-medium">Daily reminders</div>
      <p className="text-muted">Get a notification at 9 PM, 10 PM, and 11 PM if you still have tasks left. Each device must be enabled separately.</p>
      {!supported && !message && <p className="text-muted">Push notifications are not available in this browser. On iPhone, install this app from Safari using Add to Home Screen first.</p>}
      {supported && (
        <Button type="button" variant="outline" disabled={busy || !initialized} onClick={toggle}>
          {busy ? "Updating…" : !initialized ? "Loading…" : enabled ? "Turn off on this device" : "Enable on this device"}
        </Button>
      )}
      {message && <p role="status" className="text-muted">{message}</p>}
    </Card>
  );
}
