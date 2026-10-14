import { planReturnPath } from "@/lib/plan-return-path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import EquipmentDashboard from "@/components/equipment-dashboard";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams))
      if (typeof value === "string") params.set(key, value);
    redirect(
      "/login?next=" +
        encodeURIComponent(planReturnPath("/equipamentos?" + params)),
    );
  }
  return <EquipmentDashboard />;
}
