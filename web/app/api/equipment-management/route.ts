import { syncTasks } from "@/lib/tasks/store";
import { NextResponse } from "next/server";
import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { logDataError } from "@/lib/data-error";
import {
  equipmentList,
  equipmentDetail,
  saveEquipment,
  EquipmentConflict,
} from "@/lib/equipment-management/store";
import { EquipmentInputError } from "@/lib/equipment-management/planning";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  if (e instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  if (e instanceof EquipmentInputError) return json({ error: e.message }, 400);
  if (e instanceof EquipmentConflict) return json({ error: e.message }, 409);
  logDataError("equipment-management", e);
  return json(
    { error: "Não foi possível consultar ou salvar os equipamentos." },
    503,
  );
}
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const p = new URL(req.url).searchParams;
    return json(
      p.has("id")
        ? await equipmentDetail(p.get("id")!)
        : { ...(await equipmentList(p)), email: user.email },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    const raw = await req.text();
    if (raw.length > 20000)
      return json({ error: "Dados excedem o limite." }, 413);
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new EquipmentInputError("Dados inválidos.");
    }
    const result = await saveEquipment(input, user);
    try {
      await syncTasks();
    } catch {
      console.error("TASK_SYNC_AFTER_EQUIPMENT_SAVE_FAILED");
    }
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
