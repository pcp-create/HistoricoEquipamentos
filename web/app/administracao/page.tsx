import { initialSessionAccess } from "@/lib/initial-access";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const access = await initialSessionAccess();
  if (!access.cacheScope) redirect("/login");
  if (!access.admin) redirect("/");
  return <AdminDashboard />;
}
