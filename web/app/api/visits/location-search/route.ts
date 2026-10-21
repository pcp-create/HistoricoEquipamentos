import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { visitIdentity } from "@/lib/visits/store";
import { database } from "@/lib/db";
export const runtime = "nodejs";
const json = (body: unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request: Request) {
  if(!sameOrigin(request))return json({error:"Origem inválida."},403);
  try {
    const user=await requireUser();await visitIdentity(database(),user.email);
    const raw=await request.text();if(raw.length>1000)return json({error:"Pesquisa muito longa."},400);
    let input;try{input=JSON.parse(raw)}catch{return json({error:"Pesquisa inválida."},400)}
    const query=typeof input.query==="string"?input.query.trim():"";
    const reverse=input.action==="reverse";
    if(reverse && (typeof input.latitude!=="number" || !Number.isFinite(input.latitude) || Math.abs(input.latitude)>85 || typeof input.longitude!=="number" || !Number.isFinite(input.longitude) || Math.abs(input.longitude)>180))return json({error:"Coordenadas inválidas."},400);
    if(!reverse && (query.length<3 || query.length>300))return json({error:"Digite um endereço ou cidade com 3 a 300 caracteres."},400);
    const key=process.env.GEOAPIFY_API_KEY;if(!key)return json({error:"Busca de endereço indisponível. Marque o local diretamente no mapa."},503);
    const url=new URL("https://api.geoapify.com/v1/geocode/"+(reverse?"reverse":"search"));
    for(const [k,v] of Object.entries(reverse?{lat:String(input.latitude),lon:String(input.longitude),format:"json",lang:"pt",limit:"1",apiKey:key}:{text:query,filter:"countrycode:br",format:"json",lang:"pt",limit:"5",apiKey:key}))if(v!==undefined)url.searchParams.set(k,v);
    const response=await fetch(url,{signal:AbortSignal.timeout(10000),cache:"no-store"});if(!response.ok)throw Error();
    const body=await response.json();
    if(reverse){
      const result=body.results?.[0];
      if(!result || result.country_code!=="br") return json({address:null});
      const uf=String(result.state_code || result.state_code_iso3166_2 || "").replace(/^BR-/i,"").toUpperCase();
      return json({address:{city:String(result.city || result.town || result.village || "").slice(0,150),uf:"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ").includes(uf)?uf:"",address:[result.street,result.housenumber,result.suburb].filter(Boolean).join(", ").slice(0,300)}});
    }
    return json({results:(body.results || []).filter((r:any)=>Number.isFinite(r.lat)&&Math.abs(r.lat)<=85&&Number.isFinite(r.lon)&&Math.abs(r.lon)<=180).map((r:any)=>({label:r.formatted,latitude:r.lat,longitude:r.lon}))});
  } catch(error) { return json({error:error instanceof Unauthorized?"Sessão expirada.":error instanceof Forbidden?"Acesso não permitido.":"Não foi possível buscar o endereço. Tente novamente ou marque no mapa."},error instanceof Unauthorized?401:error instanceof Forbidden?403:503); }
}
