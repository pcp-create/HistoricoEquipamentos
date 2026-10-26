import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SalesProjection from "@/components/sales-projection";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; company?: string }>;
}) {
  const q = await searchParams;
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh")) redirect("/login");
  return (
    <SalesProjection
      initialPeriod={
        /^20\d{2}-(0[1-9]|1[0-2])$/.test(q.period || "") ? q.period : undefined
      }
      initialCompany={
        ["1", "2", "27404"].includes(q.company || "") ? q.company : "all"
      }
    />
  );
}
