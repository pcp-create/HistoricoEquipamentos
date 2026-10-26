import { requireUser } from "@/lib/auth";
import CommercialManagement from "@/components/commercial-management";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireUser();
  return <CommercialManagement mode="summary" />;
}
