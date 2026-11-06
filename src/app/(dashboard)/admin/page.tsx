import AdminScreen from "@/features/admin/AdminScreen";
import { pageUser } from "@/lib/auth/session";

export default async function AdminPage() {
  await pageUser(true);
  return <AdminScreen />;
}
