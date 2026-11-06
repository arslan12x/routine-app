import type { AppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import type { z } from "zod";
import type { settingsPatch } from "@/lib/validation";

export const profile = (u: AppUser) => ({
  username: u.username, name: u.name, image: u.image, role: u.role,
  settings: { timezone: u.timezone, weekStartsOn: u.weekStartsOn, displayName: u.displayName, showOnLeaderboard: u.showOnLeaderboard },
});

export async function updateSettings(u: AppUser, p: z.infer<typeof settingsPatch>) {
  await prisma.userSettings.update({
    where: { userId: u.id },
    data: { ...p, timezoneSet: p.timezone ? true : undefined },
  });
}
