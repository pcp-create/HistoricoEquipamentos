import { initialSessionAccess } from "@/lib/initial-access";
import { redirect } from "next/navigation";

export default async function VisitsManagementLayout({ children }: { children: React.ReactNode }) {
  const access = await initialSessionAccess();
  if (!access.visitManager) redirect("/visitas");
  return children;
}
