import {requireUser,Unauthorized} from '@/lib/auth';
import {equipmentWarranty} from '@/lib/equipment/warranty';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
  await requireUser();const p=new URL(request.url).searchParams;
  const equipment=p.get('equipment')||'',company=p.get('excludeCompany'),order=p.get('excludeOrder');
  if(!/^[1-9]\d{0,17}$/.test(equipment)||company&&!['1','2','27404'].includes(company)||order&&!/^[1-9]\d{0,17}$/.test(order))return Response.json({error:'Equipamento ou OS inválidos.'},{status:400});
  return Response.json({warranty:await equipmentWarranty(equipment,company,order)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:e instanceof Unauthorized?'Sessão expirada.':'Não foi possível consultar a garantia do equipamento.'},{status:e instanceof Unauthorized?401:503});}
}
