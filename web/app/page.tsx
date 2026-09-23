import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ModuleHome from "@/components/module-home";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh")) redirect("/login");
  const params = await searchParams;
  const legacy = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(v => legacy.append(key, v));
    else if (value !== undefined) legacy.set(key, value);
  }
  if (legacy.size) redirect("/historico?" + legacy.toString());
  return <ModuleHome />;
}
