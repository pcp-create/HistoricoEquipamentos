import "server-only";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
import { contactAccess } from "./contacts";
import { createTask } from "../tasks/store";
import { linkTaskAssignee } from "../equipment/customer-links";
import { selectedJobType } from "./job-types";
export async function updateContactJob(
  b: any,
  actor: string,
  taskWriter = createTask,
) {
  if (
    typeof b.contactId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      b.contactId,
    ) ||
    !Number.isSafeInteger(b.version) ||
    b.version < 1
  )
    throw new AdminInputError(
      "Contato inválido. Atualize a lista antes de editar.",
    );
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await contactAccess(c, b.customer, actor);
    const previous = (
      await c.query(
        `SELECT c.*,COALESCE(j.name,c.job_title) effective_job_title,COALESCE(j.m8_id,c.cargo_id) effective_cargo_id FROM web_customer_contacts c LEFT JOIN web_contact_job_types j ON j.id=c.job_type_override_id WHERE c.id=$1 AND c.customer_key=$2 AND c.integration_state NOT IN ('sending','uncertain','failed') FOR UPDATE OF c`,
        [b.contactId, b.customer],
      )
    ).rows[0];
    if (!previous || previous.job_version !== b.version)
      throw new AdminInputError(
        "O contato foi alterado ou não pertence a este cliente. Atualize a lista antes de editar.",
      );
    const job = b.jobTypeId ? await selectedJobType(c, b.jobTypeId) : null;
    const overrides = { ...previous.field_overrides };
    const labels: Record<string, string> = {
      name: "Nome",
      phone: "Telefone",
      email: "E-mail",
      additional_phone: "Telefone adicional",
      document: "CPF/CNPJ",
      notes: "Observação",
    };
    const limits: Record<string, number> = {
      name: 160,
      phone: 40,
      email: 254,
      additional_phone: 40,
      document: 20,
      notes: 2000,
    };
    const changes: string[] = [];
    for (const field of Object.keys(labels)) {
      if (!Object.hasOwn(b, field)) continue;
      if (typeof b[field] !== "string" || b[field].length > limits[field])
        throw new AdminInputError(`Confira o campo ${labels[field]}.`);
      const value = b[field].trim(),
        before = String(overrides[field] ?? previous[field] ?? "");
      if (value === before) continue;
      if (field === "name" && !value)
        throw new AdminInputError("Informe o nome do contato.");
      if (
        ["phone", "additional_phone"].includes(field) &&
        value &&
        !/^[+()\d\s.-]{8,40}$/.test(value)
      )
        throw new AdminInputError("Informe um telefone válido.");
      if (
        field === "email" &&
        value &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
        throw new AdminInputError("Informe um e-mail válido.");
      if (
        field === "document" &&
        value &&
        ![11, 14].includes(value.replace(/\D/g, "").length)
      )
        throw new AdminInputError("Confira o CPF/CNPJ do contato.");
      overrides[field] = value;
      changes.push(
        `${labels[field]}: ${before || "Não informado"} → ${value || "Não informado"}`,
      );
    }
    if (job && Number(job.m8_id) !== Number(previous.effective_cargo_id))
      changes.push(
        `Cargo: ${previous.effective_job_title || "Não informado"} → ${job.name} (ID M8 ${job.m8_id})`,
      );
    const effective = {
      ...previous,
      ...overrides,
      job_title: job?.name || previous.effective_job_title,
      cargo_id: job?.m8_id ?? previous.effective_cargo_id,
      job_type_id: job?.id || previous.job_type_override_id,
    };
    if (!changes.length) {
      await c.query("COMMIT");
      return effective;
    }
    let assignee: string;
    try {
      assignee = await linkTaskAssignee(c);
    } catch (e) {
      throw new AdminInputError((e as Error).message);
    }
    const row = (
      await c.query(
        `UPDATE web_customer_contacts SET field_overrides=$3,job_type_override_id=COALESCE($4,job_type_override_id),job_version=job_version+1,job_updated_by=$5,job_updated_at=now() WHERE id=$1 AND customer_key=$2 RETURNING job_version`,
        [
          b.contactId,
          b.customer,
          JSON.stringify(overrides),
          job?.id || null,
          actor,
        ],
      )
    ).rows[0];
    const customer =
      (
        await c.query(
          b.customer.startsWith("m8:")
            ? "SELECT name FROM m8_customer_directory WHERE person_id=$1 LIMIT 1"
            : "SELECT name FROM web_sales_leads WHERE id=$1",
          [b.customer.slice(b.customer.startsWith("m8:") ? 3 : 5)],
        )
      ).rows[0]?.name || b.customer;
    const result = await taskWriter(
      {
        title: ("Ajustar contato no M8 — " + effective.name).slice(0, 160),
        description: `Atualização salva somente no sistema. Ajuste manualmente o cadastro correspondente no M8.
Cliente: ${customer} (${b.customer})
Contato: ${effective.name}
ID do contato M8: ${previous.m8_id || "Não integrado"}
Solicitante: ${actor}
Alterações:
${changes.join("\n")}`,
        priority: "normal",
        assignedTo: assignee,
        dueDate: "",
      },
      { id: actor, email: actor },
      c,
    );
    await c.query(
      "UPDATE web_tasks SET origin='Ajuste de contato · Visitas',customer=$2 WHERE id=$1",
      [result.task.id, customer],
    );
    await c.query("COMMIT");
    return {
      id: previous.id,
      name: effective.name,
      phone: effective.phone,
      email: effective.email,
      additional_phone: effective.additional_phone,
      document: effective.document,
      notes: effective.notes,
      job_title: effective.job_title,
      cargo_id: effective.cargo_id,
      job_type_id: effective.job_type_id,
      m8_id: previous.m8_id,
      job_version: row.job_version,
    };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
