import "server-only";
import { createHash } from "node:crypto";
import { database } from "../db";
import { m8Session } from "../service-orders/m8";
import { createTask } from "../tasks/store";
import { canOpenPath, userModules } from "../user-modules";
import { belowMinimumPrices } from "./minimum-price-review";
import { proposalOrderDraft } from "./financials";
import { CrmError, uuid } from "./model";
import { getProposal } from "./store";
export { priceManager } from "./price-manager";
import { priceManager } from "./price-manager";
export function priceFingerprint(draft: any) {
  const d = proposalOrderDraft(draft);
  return createHash("sha256")
    .update(
      JSON.stringify([
        d.company,
        d.customer,
        d.type,
        d.items.map((i) => [i.kind, i.code, i.quantity, i.price]),
      ]),
    )
    .digest("hex");
}
export async function currentMinimum(call: any, code: string) {
  const rows = await call(
    "/v1/estoque/produto?Id=" +
      encodeURIComponent(code) +
      "&Page=1&PageSize=10",
  );
  const product = (Array.isArray(rows) ? rows : []).find(
    (p: any) => String(p.id) === String(code),
  );
  if (
    !product ||
    product.precoVendaMinimo == null ||
    !Number.isFinite(Number(product.precoVendaMinimo)) ||
    Number(product.precoVendaMinimo) < 0
  )
    throw new CrmError(
      "Não foi possível confirmar o preço mínimo do produto " + code + ".",
    );
  return Number(product.precoVendaMinimo);
}
export async function approvedPrices(db: any, proposal: string, draft: any) {
  const rows = (
    await db.query(
      `SELECT a.*,t.approval_state,t.approval_decided_by,u.* FROM crm_price_approvals a JOIN web_tasks t ON t.id=a.task_id LEFT JOIN web_user_access u ON u.email=t.approval_decided_by WHERE a.proposal_id=$1 AND a.fingerprint=$2 ORDER BY a.id DESC`,
      [proposal, priceFingerprint(draft)],
    )
  ).rows;
  return rows.find(
    (r: any) => r.approval_state === "approved" && priceManager(r),
  );
}
export async function priceReview(id: string, orderType: string) {
  const p = await getProposal(uuid(id));
  const active = (
    await database().query(
      "SELECT document FROM crm_order_links WHERE proposal_id=$1 AND state NOT IN ('complete','validation_failed') ORDER BY created_at DESC LIMIT 1",
      [id],
    )
  ).rows[0];
  const draft = active?.document || {
    ...p.document,
    type: orderType || p.document.type,
  };
  const call = await m8Session(Number(draft.company)),
    net = proposalOrderDraft(draft),
    items = [];
  const codes = [
    ...new Set(
      net.items.filter((i) => i.kind === "material").map((i) => i.code),
    ),
  ];
  if (
    codes.length &&
    (
      await database().query(
        "SELECT 1 FROM crm_price_restorations WHERE product_id=ANY($1::bigint[]) AND state<>'restored' LIMIT 1",
        [codes],
      )
    ).rows.length
  )
    throw new CrmError(
      "Há uma restauração de mínimo pendente para um produto desta proposta. Conclua a conferência antes de continuar.",
    );
  const minima = new Map<string, number>();
  for (let offset = 0; offset < codes.length; offset += 50) {
    const query = new URLSearchParams({ Page: "1", PageSize: "100" });
    codes
      .slice(offset, offset + 50)
      .forEach((code) => query.append("Ids", code));
    const rows = await call("/v1/estoque/produto?" + query);
    if (!Array.isArray(rows))
      throw new CrmError("Resposta inválida na consulta de preços mínimos.");
    for (const product of rows)
      if (
        product.precoVendaMinimo != null &&
        Number.isFinite(Number(product.precoVendaMinimo)) &&
        Number(product.precoVendaMinimo) >= 0
      )
        minima.set(String(product.id), Number(product.precoVendaMinimo));
  }
  try {
    for (const item of belowMinimumPrices(draft.items, minima))
      items.push({
        code: item.code,
        name: item.name,
        quantity: net.items.find(
          (i) => i.kind === "material" && i.code === item.code,
        )!.quantity,
        price: item.saleCents / 100,
        minimum: minima.get(item.code)!,
      });
  } catch (error) {
    throw new CrmError((error as Error).message);
  }
  const users = (
    await database().query("SELECT * FROM web_user_access WHERE enabled")
  ).rows
    .filter(
      (u: any) => priceManager(u) && canOpenPath(userModules(u), "/tarefas"),
    )
    .map((u: any) => ({ email: u.email, name: u.display_name || u.email }));
  const approval = await approvedPrices(database(), id, draft);
  return {
    items,
    users,
    approved:
      !!approval &&
      items.every((i) =>
        approval.document.items.some(
          (a: any) =>
            a.code === i.code && a.price === i.price && a.minimum >= i.minimum,
        ),
      ),
    draft,
    version: p.version,
    number: p.number,
  };
}
export async function requestPriceApproval(
  input: any,
  actor: string,
  reviewPrices = priceReview,
) {
  const review = await reviewPrices(input.id, input.orderType);
  if (review.version !== input.version)
    throw new CrmError("A proposta foi alterada. Atualize a tela.");
  if (!review.items.length || review.approved)
    throw new CrmError("Não há aprovação pendente para estes valores.");
  if (!review.users.some((u: any) => u.email === input.approver))
    throw new CrmError("Selecione um gestor ativo.");
  if (
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.length > 2000
  )
    throw new CrmError("Informe a justificativa de até 2.000 caracteres.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const p = (
      await c.query(
        "SELECT version FROM crm_proposals WHERE id=$1 FOR UPDATE",
        [input.id],
      )
    ).rows[0];
    if (p.version !== review.version)
      throw new CrmError("A proposta foi alterada. Atualize a tela.");
    const hash = priceFingerprint(review.draft);
    const existing = (
      await c.query(
        "SELECT a.task_id FROM crm_price_approvals a JOIN web_tasks t ON t.id=a.task_id WHERE proposal_id=$1 AND fingerprint=$2 AND t.approval_state='pending'",
        [input.id, hash],
      )
    ).rows[0];
    if (existing) {
      await c.query("COMMIT");
      return { taskId: existing.task_id };
    }
    const description =
      `Aprovar preços abaixo do mínimo da PROP-${review.number}.\nProposta: /crm/propostas/${input.id}\n\n${input.reason.trim()}\n\n` +
      review.items
        .slice(0, 40)
        .map(
          (i) =>
            `${i.code} · ${i.name.slice(0, 60)}: venda R$ ${i.price.toFixed(2)}; mínimo R$ ${i.minimum.toFixed(2)}; quantidade ${i.quantity}`,
        )
        .join("\n") +
      (review.items.length > 40
        ? `\nMais ${review.items.length - 40} itens: confira a relação completa na proposta antes de aprovar.`
        : "") +
      "\n\nA aprovação autoriza a redução temporária do mínimo no M8 exclusivamente para incluir estes itens, com restauração em seguida.";
    const result = await createTask(
      {
        taskType: "approval",
        title: `Aprovação de preços · PROP-${review.number}`,
        description,
        assignedTo: input.approver,
        priority: "high",
        dueDate: "",
      },
      { id: actor, email: actor },
      c,
    );
    await c.query("UPDATE web_tasks SET source_key=$2 WHERE id=$1", [
      result.task.id,
      "manual:crm-price:" + input.id + ":" + result.task.id,
    ]);
    await c.query(
      "INSERT INTO crm_price_approvals(proposal_id,fingerprint,task_id,document) VALUES($1,$2,$3,$4)",
      [
        input.id,
        hash,
        result.task.id,
        JSON.stringify({
          items: review.items,
          draft: review.draft,
          version: review.version,
          number: review.number,
        }),
      ],
    );
    await c.query("COMMIT");
    return { taskId: result.task.id };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
