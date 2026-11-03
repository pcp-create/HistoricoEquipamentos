import "server-only";
import { createTask } from "../tasks/store";
/** Resolve before the ERP write, so a chargeable inclusion cannot silently lose its follow-up. */
export async function billingMaterialOwner(
  c: any,
  company: string,
  order: string,
  selected?: string,
) {
  const record = (
    await c.query(
      "SELECT to_jsonb(m8_ordens_servico)->>'situacao_nome' situacao_nome FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",
      [company, order],
    )
  ).rows[0];
  if (!/cobran/i.test(record?.situacao_nome || "")) return null;
  const incoming = (
    await c.query(
      "SELECT 1 FROM web_order_links WHERE linked_company_id=$1 AND linked_order_id=$2",
      [company, order],
    )
  ).rows.length;
  if (incoming) return null;
  if (selected != null && typeof selected !== "string")
    throw Error("Selecione o Orçamentista responsável.");
  let owner = selected?.trim().toLowerCase();
  if (!owner) {
    const tasks = (
      await c.query(
        `SELECT DISTINCT t.assigned_to email FROM web_tasks t JOIN web_user_access u ON u.email=t.assigned_to LEFT JOIN web_task_stages s ON s.id=t.stage_id
   WHERE t.order_company=$1 AND t.order_id=$2 AND t.status<>'completed' AND u.enabled
   AND (u.job_title ILIKE '%orçament%' OR u.job_title ILIKE '%orcament%' OR s.job_title ILIKE '%orçament%')`,
        [company, order],
      )
    ).rows;
    if (tasks.length === 1) owner = tasks[0].email;
  }
  if (!owner) {
    const users = (
      await c.query(
        "SELECT email FROM web_user_access WHERE enabled AND (job_title ILIKE '%orçament%' OR job_title ILIKE '%orcament%')",
      )
    ).rows;
    if (users.length === 1) owner = users[0].email;
  }
  if (!owner)
    throw Error(
      "Selecione o Orçamentista responsável pela tratativa da inclusão na OS de cobrança.",
    );
  const user = (
    await c.query("SELECT enabled,phone FROM web_user_access WHERE email=$1", [
      owner,
    ])
  ).rows[0];
  if (!user?.enabled || !user.phone)
    throw Error(
      "O responsável pela inclusão precisa estar ativo e ter WhatsApp cadastrado.",
    );
  return owner;
}
export async function createBillingMaterialTask(
  c: any,
  id: string,
  input: any,
  actor: string,
  info: any,
  owner: string,
) {
  const source = "manual:warehouse-material:" + id;
  const previous = (
    await c.query("SELECT id FROM web_tasks WHERE source_key=$1", [source])
  ).rows[0];
  if (previous) return String(previous.id);
  const result = await createTask(
    {
      title: `Incluir material no orçamento da OS ${info.orderNumber}`.slice(
        0,
        160,
      ),
      description: `Material acrescentado à OS principal de cobrança. Revisar o orçamento, valores e aprovação do cliente.\nProduto: ${info.productCode} · ${info.productName}\nQuantidade: ${info.quantity} ${info.unit}\nValor unitário: R$ ${info.price}\nJustificativa: ${info.justification}`,
      assignedTo: owner,
      priority: "high",
      dueDate: "",
      orderCompany: String(input.company),
      orderId: String(input.order),
    },
    { id: actor, email: actor },
    c,
  );
  await c.query(
    "UPDATE web_tasks SET source_key=$2,origin='Inclusão de material em OS de cobrança' WHERE id=$1",
    [result.task.id, source],
  );
  return String(result.task.id);
}
