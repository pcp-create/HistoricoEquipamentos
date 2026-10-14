import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PasswordChangeForm from "@/components/password-change-form";
export const dynamic="force-dynamic";
export default async function Page(){
  const jar=await cookies();
  if(!jar.has("m8-access")&&!jar.has("m8-refresh"))redirect("/login?next=%2Ftrocar-senha");
  return <PasswordChangeForm/>;
}
