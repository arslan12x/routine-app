import SettingsForm from "@/features/settings/SettingsForm";
import { pageUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const u = await pageUser();
  return <SettingsForm email={u.email} initial={{ timezone: u.timezone, weekStartsOn: u.weekStartsOn, displayName: u.displayName, showOnLeaderboard: u.showOnLeaderboard }} />;
}
