import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import CatalogConfiguration from "@/components/catalog-configuration";
export const dynamic = "force-dynamic";
export default async function Page() {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh")) redirect("/login");
  return <CatalogConfiguration />;
}
