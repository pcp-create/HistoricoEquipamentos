import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireUser();
  redirect("/comercial/resumo");
}
