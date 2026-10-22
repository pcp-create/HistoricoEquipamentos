import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import NewServiceOrder from "@/components/new-service-order";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; id?: string }>;
}) {
  const p = await searchParams;
  if (
    !["1", "2", "27404"].includes(p.empresa || "") ||
    !/^[1-9]\d{0,9}$/.test(p.id || "")
  )
    redirect("/historico");
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh"))
    redirect(
      "/login?next=" +
        encodeURIComponent(
          "/OrdemServico/editar?empresa=" + p.empresa + "&id=" + p.id,
        ),
    );
  return <NewServiceOrder editing={{ company: p.empresa!, id: p.id! }} />;
}
