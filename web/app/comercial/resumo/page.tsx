import { requireUser } from "@/lib/auth";
import { accessRecord } from "@/lib/admin-store";
import CommercialManagement from "@/components/commercial-management";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser();
  const access = await accessRecord(user.email);
  return (
    <CommercialManagement
      canManage={access?.enabled === true && access.role === "admin"}
    />
  );
}
