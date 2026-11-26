import "server-only";
import { database } from "../db";
import { m8Session } from "../service-orders/m8";
import { CrmError, uuid, version } from "./model";
import { priceManager } from "./price-manager";
import { itemPriceKey } from "./item-price-key";
import { belowMinimumPrices } from "./minimum-price-review";
import type { OrderDraft } from "../service-orders/model";

export async function itemApprovals(
  db: any,
  id: string,
  draft: OrderDraft,
  leadId = "",
) {
  if (!draft.items?.some((i) => i.kind === "material")) return [];
  const rows = (
    await db.query(
      `SELECT a.*,u.enabled,u.role,to_jsonb(u)->'job_titles' job_titles,to_jsonb(u)->>'job_title' job_title FROM crm_item_price_approvals a JOIN web_user_access u ON u.email=a.approved_by WHERE a.proposal_id=$1`,
      [id],
    )
  ).rows;
  return rows.filter(
    (a: any) =>
      priceManager(a) &&
      draft.items.some(
        (i) =>
          i.kind === "material" &&
          itemPriceKey(draft, i, leadId) === a.item_key,
      ),
  );
}
export async function reviewItemPrices(
  db: any,
  id: string,
  draft: OrderDraft,
  leadId = "",
  session = m8Session,
) {
  const materials = (draft.items || []).filter((i) => i.kind === "material");
  if (!materials.length)
    return { items: [], approvals: [], approved: true, minimumPrices: {} };
  const codes = [...new Set(materials.map((i) => i.code))];
  if (
    (
      await db.query(
        "SELECT 1 FROM crm_price_restorations WHERE product_id=ANY($1::bigint[]) AND state<>'restored' LIMIT 1",
        [codes],
      )
    ).rows.length
  )
    throw new CrmError(
      "Há uma restauração de mínimo pendente. Confira o M8 antes de continuar.",
    );
  const call = await session(Number(draft.company)),
    minima = new Map<string, number>();
  for (let offset = 0; offset < codes.length; offset += 50) {
    const q = new URLSearchParams({ Page: "1", PageSize: "100" });
    codes.slice(offset, offset + 50).forEach((code) => q.append("Ids", code));
    const rows = await call("/v1/estoque/produto?" + q);
    if (!Array.isArray(rows))
      throw new CrmError("Não foi possível consultar os mínimos no M8.");
    for (const row of rows)
      if (
        row.precoVendaMinimo != null &&
        Number.isFinite(Number(row.precoVendaMinimo)) &&
        Number(row.precoVendaMinimo) >= 0
      )
        minima.set(String(row.id), Number(row.precoVendaMinimo));
  }
  const approvals = await itemApprovals(db, id, draft, leadId);
  let below;
  try {
    below = belowMinimumPrices(materials, minima);
  } catch (e) {
    throw new CrmError((e as Error).message);
  }
  const items = below.map((i) => {
    const item = materials.find((m) => m.code === i.code)!;
    const approval = approvals.find(
      (a: any) =>
        a.item_key === itemPriceKey(draft, item, leadId) &&
        Number(a.minimum_price) >= minima.get(i.code)!,
    );
    return {
      ...i,
      minimum: minima.get(i.code)!,
      price: i.saleCents / 100,
      approved: !!approval,
    };
  });
  return {
    items,
    approvals,
    approved: items.every((i) => i.approved),
    minimumPrices: Object.fromEntries(minima),
  };
}
export async function approveProposalItem(
  input: any,
  actor: string,
  session = m8Session,
) {
  const id = uuid(input.id),
    expected = version(input.version),
    db = database(),
    c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    const user = (
      await c.query("SELECT * FROM web_user_access WHERE email=$1 FOR SHARE", [
        actor,
      ])
    ).rows[0];
    if (!priceManager(user))
      throw new CrmError(
        "Somente Gestor, Coordenador, Diretor ou Administrador pode aprovar abaixo do mínimo.",
      );
    const p = (
      await c.query(
        "SELECT p.*,o.lead_id,o.status opportunity_status FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1 FOR UPDATE OF p,o",
        [id],
      )
    ).rows[0];
    if (!p || p.version !== expected)
      throw new CrmError("A proposta foi alterada. Atualize antes de aprovar.");
    const workflow = (
      await c.query(
        "SELECT state FROM crm_proposal_workflows WHERE proposal_id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (
      !["pending", "converting"].includes(p.status) ||
      p.opportunity_status !== "open" ||
      !["creating", "in_review", "reviewed", "sent"].includes(workflow?.state || "creating")
    )
      throw new CrmError(
        "Esta proposta não está disponível para aprovação de preços.",
      );
    const item = p.document.items.find(
      (i: any) => i.kind === "material" && i.code === String(input.code),
    );
    if (!item) throw new CrmError("Produto não encontrado na proposta.");
    const result = await reviewItemPrices(
        c,
        id,
        p.document,
        p.lead_id || "",
        session,
      ),
      below = result.items.find((i) => i.code === item.code);
    if (!below)
      throw new CrmError("Este produto não está abaixo do mínimo atual.");
    const key = itemPriceKey(p.document, item, p.lead_id || "");
    await c.query(
      `INSERT INTO crm_item_price_approvals(proposal_id,item_key,product_id,minimum_price,document,approved_by,approved_name) VALUES($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(proposal_id,item_key) DO UPDATE SET minimum_price=EXCLUDED.minimum_price,document=EXCLUDED.document,approved_by=EXCLUDED.approved_by,approved_name=EXCLUDED.approved_name,approved_at=now()`,
      [
        id,
        key,
        item.code,
        below.minimum,
        JSON.stringify(item),
        actor,
        user.display_name || actor,
      ],
    );
    const saved = (
      await c.query(
        "UPDATE crm_proposals SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING version",
        [id, actor],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'item_price_approved',$4)",
      [
        p.opportunity_id,
        id,
        actor,
        JSON.stringify({
          code: item.code,
          price: below.price,
          minimum: below.minimum,
          itemKey: key,
        }),
      ],
    );
    await c.query("COMMIT");
    return saved;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
