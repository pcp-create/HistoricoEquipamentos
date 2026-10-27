import {customerEquipment} from "@/lib/visits/customer-equipment";
import {database} from "@/lib/db";
import { requireUser, sameOrigin, Forbidden, Unauthorized } from "@/lib/auth";
import { AdminInputError } from "@/lib/admin-store";
import { TaskInputError } from "@/lib/tasks/store";
import {
  listMachines,
  registerMachine,
} from "@/lib/visits/machine-registration";
const json = (b: unknown, status = 200) =>
  Response.json(b, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function fail(e: unknown) {
  return json(
    {
      error:
        e instanceof AdminInputError || e instanceof TaskInputError
          ? e.message
          : "Não foi possível acessar o cadastro de máquinas.",
    },
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof AdminInputError || e instanceof TaskInputError
          ? 400
          : 503,
  );
}
export async function GET(r: Request) {
  try {
    const u = await requireUser();
    const key=new URL(r.url).searchParams.get("customer")||"";
    const machines=await listMachines(key,u.email);
    if(new URL(r.url).searchParams.get("equipment")==="1")return json({machines,equipment:await customerEquipment(database(),key)});
    return json({machines});
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser(),
      raw = await r.text();
    if (raw.length > 5000) throw new AdminInputError("Dados muito longos.");
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AdminInputError("Dados inválidos.");
    }
    return json(await registerMachine(b, u));
  } catch (e) {
    return fail(e);
  }
}
