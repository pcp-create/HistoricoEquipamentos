import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TasksDashboard from "@/components/tasks-dashboard";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const jar = await cookies();
  const { task } = await searchParams;
  if (!jar.has("m8-access") && !jar.has("m8-refresh"))
    redirect(
      "/login?next=" +
        encodeURIComponent(
          "/tarefas" + (task && /^\d+$/.test(task) ? "?task=" + task : ""),
        ),
    );
  return <TasksDashboard />;
}
