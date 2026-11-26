import {requireUser, sameOrigin, Forbidden, Unauthorized} from '@/lib/auth';
import {checkPersonalTimeOverlap, TimeRequestError} from '@/lib/service-scheduling/time-request-store';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:'Origem inválida.'},{status:403});
  try {
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 40000) return Response.json({error:'Dados excedem o limite.'},{status:413});
    let input: any;
    try { input = JSON.parse(raw); } catch { return Response.json({error:'Dados inválidos.'},{status:400}); }
    try { await checkPersonalTimeOverlap(user.email,input.proposed,input.sessionId); }
    catch (error) {
      if (error instanceof Forbidden) throw error;
      if (error instanceof TimeRequestError || error instanceof RangeError || (error instanceof Error && /^(Informe|O término|O apontamento|Pausas|As pausas)/.test(error.message))) return Response.json({error:error.message},{status:400});
      throw error;
    }
    return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    return Response.json({error:error instanceof Unauthorized?'Sessão expirada.':error instanceof Forbidden?'Acesso não permitido.':'Não foi possível verificar os horários. Conecte-se e tente novamente.'},{status:error instanceof Unauthorized?401:error instanceof Forbidden?403:503});
  }
}
