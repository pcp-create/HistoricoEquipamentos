import {requireAdmin,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {saveChecklistPhoto,ChecklistPhotoError} from '@/lib/service-scheduling/checklist-photos';
export const runtime='nodejs';
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Origem inválida.'},{status:403});
 try{
  const user=await requireAdmin();
  if(Number(req.headers.get('content-length')||0)>3300000)return Response.json({error:'Foto limitada a 3 MB.'},{status:413});
  const f=await req.formData(),file=f.get('file');
  if(!(file instanceof File))throw new ChecklistPhotoError('Selecione uma foto.');
  return Response.json(await saveChecklistPhoto(String(f.get('operationId')),String(f.get('stageId')),String(f.get('fieldId')),file,user.email));
 }catch(e){return Response.json({error:e instanceof ChecklistPhotoError?e.message:'Não foi possível anexar a foto.'},{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof ChecklistPhotoError?400:503});}
}
