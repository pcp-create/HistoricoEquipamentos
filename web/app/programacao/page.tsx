import { initialSessionAccess } from "@/lib/initial-access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ServiceScheduling from "@/components/service-scheduling";
export const dynamic = "force-dynamic";
export default async function Page() {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh"))
    redirect("/login?next=%2Fprogramacao");
  if (!(await initialSessionAccess()).admin) redirect("/");
  return <ServiceScheduling />;
}
