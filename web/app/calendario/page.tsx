import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import UnifiedCalendar from "@/components/unified-calendar";
import SiteHeader from "@/components/site-header";
export const dynamic = "force-dynamic";
export const metadata = { title: "Calendário geral | RJ Compressores" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh"))
    redirect("/login?next=%2Fcalendario");
  const { source } = await searchParams;
  return (
    <>
      <SiteHeader active="calendar" />
      <main className="general-calendar-page">
        <h1>Calendário geral</h1>
        <UnifiedCalendar
          initialSource={
            source === "operations" || source === "visits" || source === "tasks"
              ? source
              : "all"
          }
        />
      </main>
    </>
  );
}
