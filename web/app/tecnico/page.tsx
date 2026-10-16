import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import FieldApp from "@/components/field-app";
export const metadata={manifest:"/field-offline/manifest.webmanifest"};
export const dynamic = "force-dynamic";
export default async function Page() {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh"))
    redirect("/tecnico/entrar");
  return <FieldApp />;
}
