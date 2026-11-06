import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";

export interface AppUser {
  id: string;
  email: string;
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
export async function requireUser(): Promise<AppUser> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in");
  const allowed = await prisma.allowedEmail.findUnique({ where: { email: s.user.email.toLowerCase() } });
  if (!allowed || allowed.revokedAt) throw new ApiError(403, "FORBIDDEN", "Access denied");
  const st =
    (await prisma.userSettings.findUnique({ where: { userId: s.user.id } })) ??
    (await prisma.userSettings.create({ data: { userId: s.user.id } }));
  return {
    id: s.user.id,
    email: s.user.email,
    name: s.user.name,
    image: s.user.image ?? null,
    role: allowed.role,
    timezone: st.timezone,
    timezoneSet: st.timezoneSet,
    weekStartsOn: st.weekStartsOn === 7 ? 7 : 1,
    displayName: st.displayName,
    showOnLeaderboard: st.showOnLeaderboard,
  };
}

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
