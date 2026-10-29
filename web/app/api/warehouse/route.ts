import {requireUser,sameOrigin,Unauthorized} from "@/lib/auth";
import {warehouseOrders,warehouseOrder,deliverWarehouse,WarehouseError} from "@/lib/warehouse/store";
import {warehouseProducts,addWarehouseMaterial} from "@/lib/warehouse/materials";
import {warehouseFlowStatuses,changeWarehouseFlow} from "@/lib/warehouse/flow";
export const maxDuration=120;
export const runtime="nodejs";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
function failure(e:unknown){return json({error:e instanceof Unauthorized?"Sessão expirada.":e instanceof WarehouseError?e.message:"Não foi possível acessar o almoxarifado."},e instanceof Unauthorized?401:e instanceof WarehouseError?400:503);}
export async function GET(request:Request){try{await requireUser();const p=new URL(request.url).searchParams;return json(p.has("flowStatuses")?await warehouseFlowStatuses():p.has("products")?await warehouseProducts(p.get("company")||"",p.get("q")||"",Number(p.get("page")||1)):p.has("order")?await warehouseOrder(p.get("company")||"",p.get("order")||""):await warehouseOrders(p.get("q")||"",Number(p.get("page")||1),p.get("view")==="kanban",p.get("scope")==="returns",p.get("scope")==="delivered"));}catch(e){return failure(e);}}
export async function POST(request:Request){if(!sameOrigin(request))return json({error:"Origem inválida."},403);try{const user=await requireUser();const text=await request.text();if(text.length>100000)return json({error:"Solicitação muito grande."},413);let input;try{input=JSON.parse(text);}catch{return json({error:"Dados inválidos."},400);}if(![undefined,"delivery","receipt","add_material","flow"].includes(input?.action))return json({error:"Ação inválida."},400);return json(input?.action==="flow"?await changeWarehouseFlow(input,user.email):input?.action==="add_material"?await addWarehouseMaterial(input,user.email):await deliverWarehouse(input,user.email));}catch(e){return failure(e);}}
