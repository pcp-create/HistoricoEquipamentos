import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SalesVisitsManagement from "@/components/sales-visits-management";
export const dynamic = "force-dynamic";
export const metadata = { title: "Gestão de Visitas | Portal Vendas RJ" };
export default async function Page() {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh"))
    redirect("/vendas/entrar");
  // Consolidated data is authorized server-side by /api/visits/management.
  return <SalesVisitsManagement />;
}
