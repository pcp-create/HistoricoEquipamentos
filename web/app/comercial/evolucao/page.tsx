import { requireUser } from "@/lib/auth";
import BillingEvolution from "@/components/billing-evolution";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireUser();
  return <BillingEvolution />;
}
