export const maxDuration=60;
import {reserveInternalSerial} from '@/lib/equipment/internal-serial';
import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {registerWorkshopEquipment,linkExistingEquipment,EquipmentRegistrationError} from '@/lib/workshop/equipment-registration';
import {M8RequestError} from '@/lib/service-orders/m8';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){try{await requireUser();const serial=new URL(req.url).searchParams.get('serial')||'';if(serial.length>100)return json({error:'Série inválida.'},400);const {serialCandidates}=await import('@/lib/equipment/serial-search');return json({rows:await serialCandidates(serial)});}catch(e){return json({error:'Não foi possível conferir a série.'},e instanceof Unauthorized?401:503);}}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser(),text=await req.text();if(text.length>12000)return json({error:'Dados excedem o limite.'},413);
  let input;try{input=JSON.parse(text);}catch{throw new EquipmentRegistrationError('Dados inválidos.');}
  if(input.action==='reserve-internal-serial')return json(await reserveInternalSerial(input.reservationId,user.email));
  return json(input.action==='link-existing'?await linkExistingEquipment(input,user.email):await registerWorkshopEquipment(input,user.email));
 }catch(e){if(e instanceof Unauthorized)return json({error:'Entre novamente para continuar.'},401);if(e instanceof Forbidden)return json({error:'Acesso não permitido.'},403);if(e instanceof EquipmentRegistrationError||e instanceof M8RequestError)return json({error:e.message},400);console.error('WORKSHOP_EQUIPMENT_REGISTRATION_FAILED');return json({error:'Não foi possível confirmar o cadastro. Tente consultar novamente antes de um novo envio.'},503);}
}
