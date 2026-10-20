import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import type { AuthUser } from "../user-display-name";
import { visitsData } from "./store";
import { emptyOperating, brazilToday, validDate, EquipmentInputError } from "../equipment-management/planning";
import { saveEquipment, EquipmentConflict } from "../equipment-management/store";

export async function saveVisitMeter(body: any, user: AuthUser, management = false) {
  const data = await visitsData(user.email, undefined, management);
  const customer = data.customers.find(c => c.key === body.customer_key);
  const equipment = customer?.equipment?.find(e => e.id === body.equipment);
  if (!equipment) throw new Forbidden();
  if (typeof body.meter !== "number" || !Number.isFinite(body.meter) || body.meter < 0 || body.meter > 100000000)
    throw new EquipmentInputError("Informe um horímetro válido.");
  const meterDate = body.meterDate ?? brazilToday();
  if (!validDate(meterDate) || meterDate > brazilToday())
    throw new EquipmentInputError("Informe uma data de coleta válida, até hoje.");
  const current = (await database().query("SELECT document,version FROM web_equipment_settings WHERE equipment_id=$1", [equipment.id])).rows[0];
  if ((current?.version ?? null) !== body.version) throw new EquipmentConflict("A leitura foi atualizada. Feche e reabra o equipamento antes de salvar.");
  const document = { ...emptyOperating, ...current?.document };
  if (document.meter != null && body.meter < document.meter)
    throw new EquipmentInputError("O horímetro atual não pode ser menor que a última leitura.");
  return saveEquipment({action:"settings", equipment:equipment.id, version:current?.version ?? null,
    document:{...document,meter:body.meter,meterDate}},user);
}
