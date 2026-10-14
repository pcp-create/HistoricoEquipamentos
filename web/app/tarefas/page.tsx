import { initialSessionAccess } from "@/lib/initial-access";
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
  const access = await initialSessionAccess();
  if (!["tarefas"].some(id => access.modules.includes(id))) redirect("/");
  return <TasksDashboard />;
}
