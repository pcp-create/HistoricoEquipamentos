import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import ModuleHome from "@/components/module-home";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh")) redirect("/login");
  const { module } = await params;
  if (
    ![
      "tarefas",
      "crm",
      "assistencia-tecnica",
      "suprimentos",
      "equipamentos",
    ].includes(module)
  )
    notFound();
  return <ModuleHome moduleId={module} />;
}
