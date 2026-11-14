import AdminScreen from "@/features/admin/AdminScreen";
import { pageUser } from "@/lib/auth/session";

export default async function AdminPage() {
  const user = await pageUser(true);
  return <AdminScreen canCreateWorkspace={user.isPlatformAdmin} activeWorkspaceName={user.organizationName} />;
}
