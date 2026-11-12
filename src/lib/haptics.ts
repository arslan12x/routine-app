import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export function triggerLightImpact() {
  if (!Capacitor.isNativePlatform()) return;
  void Haptics.impact({ style: ImpactStyle.Light }).catch((error: unknown) => {
    console.warn("[Haptics] Could not trigger light impact", error);
  });
}

export function triggerSuccessNotification() {
  if (!Capacitor.isNativePlatform()) return;
  void Haptics.notification({ type: NotificationType.Success }).catch((error: unknown) => {
    console.warn("[Haptics] Could not trigger success notification", error);
  });
}
