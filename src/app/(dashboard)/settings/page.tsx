import SettingsForm from "@/features/settings/SettingsForm";
import { pageUser } from "@/lib/auth/session";
import { withUserDb } from "@/lib/db";

export default async function SettingsPage() {
  const u = await pageUser();
  const duolingoTask = await withUserDb(u.id, (tx) =>
    tx.task.findFirst({
      where: {
        userId: u.id,
        archivedOn: null,
        personalDevType: "DUOLINGO",
      },
      select: { id: true },
    })
  );

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsForm
        username={u.username}
        hasDuolingoTask={Boolean(duolingoTask)}
        initial={{ timezone: u.timezone, weekStartsOn: u.weekStartsOn, displayName: u.displayName, showOnLeaderboard: u.showOnLeaderboard }}
      />
    </div>
  );
}
