import "server-only";
import { database } from "./db";
export function employeeFields(body: any) {
  const string = (key: string, max: number) => {
    if (typeof body[key] !== "string" || body[key].trim().length > max)
      throw Error("Dados do funcionário inválidos.");
    return body[key].trim();
  };
  const display_name = string("display_name", 160);
  if (!display_name) throw Error("Informe o nome do funcionário.");
  const phone = string("phone", 40).replace(/[\s()+-]/g, "");
  if (phone && !/^[1-9]\d{9,14}$/.test(phone))
    throw Error(
      "Informe o WhatsApp com código do país e DDD (ex.: 5547999999999).",
    );
  for (const key of [
    "alert_preventive",
    "alert_rental",
    "alert_email",
    "alert_whatsapp",
  ])
    if (typeof body[key] !== "boolean")
      throw Error("Preferências de alertas inválidas.");
  if (body.alert_whatsapp && !phone)
    throw Error("Informe o telefone para receber alertas no WhatsApp.");
  if (
    (body.alert_preventive || body.alert_rental) &&
    !body.alert_email &&
    !body.alert_whatsapp
  )
    throw Error("Selecione ao menos um canal de recebimento.");
  if (body.task_color != null && !/^#[0-9a-f]{6}$/i.test(body.task_color)) throw Error("Selecione uma cor válida para as tarefas.");
  const hourly=body.hourly_cost;
  if(hourly!==undefined&&hourly!==null&&hourly!==""&&(!/^(\d+)(\.\d{1,2})?$/.test(String(hourly))||Number(hourly)>1000000))throw Error("Informe um custo por hora válido, com até duas casas decimais.");
  if(body.managers!==undefined&&(!Array.isArray(body.managers)||body.managers.length>20||new Set(body.managers).size!==body.managers.length||body.managers.some((v:any)=>typeof v!=='string'||!v.includes('@')||v.length>254)))throw Error("Gestores inválidos.");
  return {
    ...(body.managers!==undefined?{managers:body.managers}:{}),
    ...(hourly!==undefined?{hourly_cost:hourly===null||hourly===""?null:Number(hourly)}:{}),
    task_color: body.task_color || null,
    display_name,
    department: string("department", 120),
    job_title: string("job_title", 120),
    phone,
    alert_preventive: body.alert_preventive,
    alert_rental: body.alert_rental,
    alert_email: body.alert_email,
    alert_whatsapp: body.alert_whatsapp,
  };
}
export async function alertRecipients(topic: "preventive" | "rental") {
  const { rows } = await database().query(
    `SELECT email,phone,alert_email,alert_whatsapp FROM web_user_access WHERE enabled AND ${topic === "preventive" ? "alert_preventive" : "alert_rental"} ORDER BY email`,
  );
  return {
    emails: [...new Set(rows.filter((r) => r.alert_email).map((r) => r.email))],
    whatsapp: [
      ...new Set(
        rows.filter((r) => r.alert_whatsapp && r.phone).map((r) => r.phone),
      ),
    ],
  };
}
