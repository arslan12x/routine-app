import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { triggerLightImpact, triggerSuccessNotification } from "@/lib/haptics";

const POMODORO_NOTIFICATION_ID = 2500;

export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === "granted") return true;
      const request = await LocalNotifications.requestPermissions();
      return request.display === "granted";
    } catch (error) {
      console.warn("[LocalNotifications] Permission request failed", error);
      return false;
    }
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }
  }

  return false;
}

export async function schedulePomodoroNotification(
  durationSeconds: number,
  title: string = "Focus sprint completed! 🎯",
  body: string = "Your 25-minute Pomodoro session has ended. Take a 5-minute break!",
): Promise<void> {
  triggerLightImpact();
  const scheduleAt = new Date(Date.now() + durationSeconds * 1000);

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: POMODORO_NOTIFICATION_ID,
            title,
            body,
            schedule: { at: scheduleAt },
            sound: undefined,
          },
        ],
      });
      return;
    } catch (error) {
      console.warn("[LocalNotifications] Could not schedule native notification", error);
    }
  }

  // Web fallback if permission granted
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    setTimeout(() => {
      try {
        new Notification(title, { body, icon: "/icons/icon-192.png" });
        playChime();
        triggerSuccessNotification();
      } catch (e) {
        console.warn("[WebNotification] Fallback error", e);
      }
    }, durationSeconds * 1000);
  }
}

export async function cancelPomodoroNotification(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: POMODORO_NOTIFICATION_ID }],
      });
    } catch (error) {
      console.warn("[LocalNotifications] Could not cancel notification", error);
    }
  }
}

/** Soft melodic sound chime using Web Audio API */
export function playChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(523.25, now, 0.4);       // C5
    playTone(659.25, now + 0.15, 0.4); // E5
    playTone(783.99, now + 0.3, 0.6);  // G5
    playTone(1046.5, now + 0.45, 0.8); // C6
  } catch (error) {
    console.warn("[Audio] Could not play chime", error);
  }
}
