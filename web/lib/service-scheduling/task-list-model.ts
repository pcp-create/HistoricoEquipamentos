import { blankOperation } from "./model";
export const taskListFields = [
  ["serviceType", "Tipo de serviço"],
  ["description", "Descrição da operação"],
  ["equipmentId", "Equipamento"],
  ["checklistId", "Checklist"],
  ["responsible", "Responsável"],
  ["support", "Equipe de apoio"],
  ["duration", "Duração (h)"],
  ["calendarId", "Calendário"],
  ["internalNote", "Observação interna"],
  ["vehicleId", "Veículo"],
] as const;
export const allTaskListFields = taskListFields.map(([key]) => key);
export function taskListOperation(raw: any, fields: readonly string[]) {
  const document: any = blankOperation();
  for (const key of allTaskListFields)
    if (fields.includes(key) && raw?.[key] !== undefined)
      document[key] = structuredClone(raw[key]);
  return document;
}
export function operationSnapshot(operations: any[]) {
  return operations
    .map((o) => ({ id: o.id, version: o.version }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
