import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {registerWorkshopEquipment,EquipmentRegistrationError} from '@/lib/workshop/equipment-registration';
import {M8RequestError} from '@/lib/service-orders/m8';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser(),text=await req.text();if(text.length>12000)return json({error:'Dados excedem o limite.'},413);
  let input;try{input=JSON.parse(text);}catch{throw new EquipmentRegistrationError('Dados inválidos.');}
  return json(await registerWorkshopEquipment(input,user.email));
 }catch(e){if(e instanceof Unauthorized)return json({error:'Entre novamente para continuar.'},401);if(e instanceof Forbidden)return json({error:'Acesso não permitido.'},403);if(e instanceof EquipmentRegistrationError||e instanceof M8RequestError)return json({error:e.message},400);console.error('WORKSHOP_EQUIPMENT_REGISTRATION_FAILED');return json({error:'Não foi possível confirmar o cadastro. Tente consultar novamente antes de um novo envio.'},503);}
}
