import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { systemDb, withUserDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { usernameFromCredentialEmail } from "@/lib/auth/credentials";
import { cache } from "react";

export interface AppUser {
  id: string;
  username: string;
  name: string;
  image: string | null;
  role: "ADMIN" | "MEMBER";
  timezone: string;
  timezoneSet: boolean;
  weekStartsOn: 1 | 7;
  displayName: string | null;
  showOnLeaderboard: boolean;
}

/** Authoritative check used by every API route and page: valid session AND still whitelisted. */
export const requireUser = cache(async (): Promise<AppUser> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in");
  const username = usernameFromCredentialEmail(s.user.email);
  if (!username) throw new ApiError(403, "FORBIDDEN", "Access denied");
  const [allowed, settings] = await Promise.all([
    systemDb.allowedEmail.findUnique({ where: { email: s.user.email.toLowerCase() } }),
    withUserDb(s.user.id, (tx) => tx.userSettings.findUnique({ where: { userId: s.user.id } })),
  ]);
  if (!allowed || allowed.revokedAt) throw new ApiError(403, "FORBIDDEN", "Access denied");
  const st = settings ?? await withUserDb(s.user.id, (tx) => tx.userSettings.create({ data: { userId: s.user.id } }));
  return {
    id: s.user.id,
    username,
    name: s.user.name,
    image: s.user.image ?? null,
    role: allowed.role,
    timezone: st.timezone,
    timezoneSet: st.timezoneSet,
    weekStartsOn: st.weekStartsOn === 7 ? 7 : 1,
    displayName: st.displayName,
    showOnLeaderboard: st.showOnLeaderboard,
  };
});

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new ApiError(403, "FORBIDDEN", "Admins only");
  return u;
}

/** Page-level variant: redirects instead of throwing JSON errors. */
export async function pageUser(admin = false): Promise<AppUser> {
  try {
    return admin ? await requireAdmin() : await requireUser();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    redirect("/access-denied");
  }
}
