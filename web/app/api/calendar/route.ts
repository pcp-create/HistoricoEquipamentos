import {accessRecord} from '@/lib/admin-store';
import {userModules} from '@/lib/user-modules';
import {saveAppointment} from '@/lib/calendar/appointments';
import { requireUser, Forbidden, Unauthorized, sameOrigin } from "@/lib/auth";
import { calendarEvents, CalendarInputError } from "@/lib/calendar/store";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  try {
    const user = await requireUser(),
      params = new URL(request.url).searchParams;
    const employee=params.get("employee") || undefined;
    if(employee && employee!=="me" && employee.toLowerCase()!==user.email.toLowerCase()
      && !userModules(await accessRecord(user.email)).includes("calendario"))throw new Forbidden();
    return json(
      await calendarEvents(
        user.email,
        params.get("start") || "",
        params.get("end") || "",
        undefined,
        employee,
        params.get("appointments") === "1",
      ),
    );
  } catch (e) {
    const status =
      e instanceof CalendarInputError
        ? 400
        : e instanceof Unauthorized
          ? 401
          : e instanceof Forbidden
            ? 403
            : 503;
    return json(
      {
        error:
          status === 400
            ? (e as Error).message
            : status === 401
              ? "Sessão expirada."
              : status === 403
                ? "Acesso não permitido."
                : "Não foi possível atualizar o calendário.",
      },
      status,
    );
  }
}

export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser();const raw=await request.text();if(raw.length>15000)throw new CalendarInputError('Compromisso muito extenso.');let body;try{body=JSON.parse(raw);}catch{throw new CalendarInputError('Solicitação inválida.');}return json(await saveAppointment(user.email,body));}
 catch(e){const status=e instanceof CalendarInputError?400:e instanceof Unauthorized?401:e instanceof Forbidden?403:503;return json({error:status===400?(e as Error).message:status===401?'Sessão expirada.':status===403?'Acesso não permitido.':'Não foi possível salvar o compromisso.'},status);}
}
