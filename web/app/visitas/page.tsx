import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SalesVisits from "@/components/sales-visits";
export const dynamic = "force-dynamic";
export const metadata = { title: "Portal Vendas RJ | Visitas" };
export default async function Page() {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh"))
    redirect("/vendas/entrar");
  return <SalesVisits />;
}
