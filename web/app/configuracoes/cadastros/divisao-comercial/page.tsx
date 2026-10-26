import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import CommercialRegistries from "@/components/commercial-registries";
export const dynamic="force-dynamic";
export default async function Page(){
 const jar=await cookies();
 if(!jar.has("m8-access")&&!jar.has("m8-refresh"))redirect("/login");
 return <><SiteHeader active="registries"/><main className="manual-page">
 <Link className="button" href="/configuracoes/cadastros">← Todos os cadastros</Link>
 <header className="manual-title"><h1>Divisão Comercial</h1></header>
 <CommercialRegistries/>
 </main></>;
}
