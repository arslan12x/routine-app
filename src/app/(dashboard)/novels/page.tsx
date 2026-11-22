import { pageUser } from "@/lib/auth/session";
import { getUserReadingSessions, listNovels } from "@/server/services/novels";
import NovelsScreen from "@/features/novels/NovelsScreen";

export default async function NovelsPage() {
  const user = await pageUser();
  const [novelData, sessions] = await Promise.all([
    listNovels(user.id),
    getUserReadingSessions(user.id),
  ]);

  return (
    <NovelsScreen
      initialNovels={novelData.novels}
      initialActiveNovel={novelData.activeNovel}
      initialSessions={sessions}
    />
  );
}
