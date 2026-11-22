import type { EnabledPersonalDevModules } from "@/lib/domain/types";

export const MODULES_CHANGED_EVENT = "routine:modules-changed";

/**
 * Dispatches an event on window to notify all UI navigation listeners
 * that task-linked modules (jobs, novels, blogs, duolingo) have changed.
 */
export function notifyModulesChanged(modules?: EnabledPersonalDevModules): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<EnabledPersonalDevModules | undefined>(MODULES_CHANGED_EVENT, {
        detail: modules,
      })
    );
  }
}
