import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { visitsData } from "@/lib/visits/store";
export const runtime = "nodejs";
const json = (body: unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request: Request) {
  if(!sameOrigin(request))return json({error:"Origem inválida."},403);
  try {
    const user=await requireUser();await visitsData(user.email);
    const raw=await request.text();if(raw.length>1000)return json({error:"Pesquisa muito longa."},400);
    let input;try{input=JSON.parse(raw)}catch{return json({error:"Pesquisa inválida."},400)}
    const query=typeof input.query==="string"?input.query.trim():"";
    if(query.length<3 || query.length>300)return json({error:"Digite um endereço ou cidade com 3 a 300 caracteres."},400);
    const key=process.env.GEOAPIFY_API_KEY;if(!key)return json({error:"Busca de endereço indisponível. Marque o local diretamente no mapa."},503);
    const url=new URL("https://api.geoapify.com/v1/geocode/search");
    for(const [k,v] of Object.entries({text:query,filter:"countrycode:br",format:"json",lang:"pt",limit:"5",apiKey:key}))url.searchParams.set(k,v);
    const response=await fetch(url,{signal:AbortSignal.timeout(10000),cache:"no-store"});if(!response.ok)throw Error();
    const body=await response.json();
    return json({results:(body.results || []).filter((r:any)=>Number.isFinite(r.lat)&&Math.abs(r.lat)<=85&&Number.isFinite(r.lon)&&Math.abs(r.lon)<=180).map((r:any)=>({label:r.formatted,latitude:r.lat,longitude:r.lon}))});
  } catch(error) { return json({error:error instanceof Unauthorized?"Sessão expirada.":error instanceof Forbidden?"Acesso não permitido.":"Não foi possível buscar o endereço. Tente novamente ou marque no mapa."},error instanceof Unauthorized?401:error instanceof Forbidden?403:503); }
}
