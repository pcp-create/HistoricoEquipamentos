import {machineSettings,saveMachineSettings} from '@/lib/visits/machine-registration';
import { requireUser,sameOrigin,Unauthorized,Forbidden } from '@/lib/auth';
import { AdminInputError } from '@/lib/admin-store';
import { visitSettings,saveVisitPurpose } from '@/lib/visits/settings';
export const runtime='nodejs';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
function fail(e:unknown){return json({error:e instanceof AdminInputError?e.message:e instanceof Unauthorized?'Sessão expirada.':e instanceof Forbidden?'Usuário sem acesso.':'Não foi possível salvar ou carregar as finalidades.'},e instanceof AdminInputError?400:e instanceof Unauthorized?401:e instanceof Forbidden?403:503)}
export async function GET(){try{const u=await requireUser();return json({purposes:await visitSettings(u.email),...await machineSettings(u.email)})}catch(e){return fail(e)}}
export async function POST(r:Request){if(!sameOrigin(r))return json({error:'Origem inválida.'},403);try{const u=await requireUser();const raw=await r.text();if(raw.length>500000)throw new AdminInputError('Dados muito longos.');let b;try{b=JSON.parse(raw)}catch{throw new AdminInputError('Dados inválidos.')}if(b.action==='equipmentAssignee')await saveMachineSettings(u.email,b.equipmentAssignee);else await saveVisitPurpose(b,u.email);return json({saved:true})}catch(e){return fail(e)}}
