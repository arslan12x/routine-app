import { pageUser } from "@/lib/auth/session";
import { getUserReadingSessions, listNovels } from "@/server/services/novels";
import NovelsScreen from "@/features/novels/NovelsScreen";

export default async function NovelsPage() {
  const user = await pageUser();
  const [novels, sessions] = await Promise.all([
    listNovels(user.id),
    getUserReadingSessions(user.id),
  ]);

  return <NovelsScreen initialNovels={novels} initialSessions={sessions} />;
}
