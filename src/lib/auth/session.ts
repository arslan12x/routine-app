import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { systemDb, withUserDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
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

function normalizeAppRole(role: string | null): "ADMIN" | "MEMBER" {
  return role && ["owner", "admin"].includes(role.toLowerCase()) ? "ADMIN" : "MEMBER";
}

/** Authoritative check used by every API route and page: valid session and active organization membership. */
export const requireUser = cache(async (): Promise<AppUser> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in");

  const [user, settings] = await Promise.all([
    systemDb.user.findUnique({
      where: { id: s.user.id },
      select: {
        id: true,
        username: true,
        name: true,
        image: true,
        banned: true,
        members: {
          select: { role: true, organization: { select: { slug: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    withUserDb(s.user.id, (tx) => tx.userSettings.findUnique({ where: { userId: s.user.id } })),
  ]);

  if (!user || user.banned || user.members.length === 0) throw new ApiError(403, "FORBIDDEN", "Access denied");

  const username = s.user.username ?? user.username ?? user.name;
  const member = user.members[0];
  const st = settings ?? await withUserDb(s.user.id, (tx) => tx.userSettings.create({ data: { userId: s.user.id } }));

  return {
    id: s.user.id,
    username,
    name: s.user.name,
    image: s.user.image ?? null,
    role: normalizeAppRole(member.role),
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
