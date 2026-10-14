import { initialSessionAccess } from "@/lib/initial-access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh")) redirect("/login");
  const access = await initialSessionAccess();
  if (!["crm", "assistencia-tecnica"].some(id => access.modules.includes(id))) redirect("/");
  return <Dashboard />;
}
