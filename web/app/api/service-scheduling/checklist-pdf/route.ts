import {requireAdmin,Unauthorized,Forbidden} from '@/lib/auth';
import {checklistPdf} from '@/lib/service-scheduling/checklist-pdf';
export const runtime='nodejs';
export async function GET(req:Request){try{const user=await requireAdmin();const result=await checklistPdf(new URL(req.url).searchParams.get('operationId')||'',user.email);if(!result)return new Response(null,{status:404});return new Response(new Uint8Array(result.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${result.filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return new Response(null,{status:e instanceof Unauthorized?401:e instanceof Forbidden?403:503});}}
