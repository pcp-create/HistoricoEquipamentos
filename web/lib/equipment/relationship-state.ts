import "server-only";
/** The ERP status belongs to a customer/equipment relationship, not the equipment catalog. */
export async function equipmentRelationshipStates(db: any, ids: string[]) {
  const rows = ids.length
    ? (
        await db.query(
          `SELECT equipment_id::text,person_id::text,person_name,payload,collected_at,company_id FROM m8_person_equipment WHERE present AND equipment_id=ANY($1::bigint[]) ORDER BY (company_id=1) DESC,collected_at DESC`,
          [ids],
        )
      ).rows
    : [];
  const result = new Map<
    string,
    { clients: Map<string, any>; inactivation: any }
  >();
  for (const row of rows) {
    let state = result.get(row.equipment_id);
    if (!state) {
      state = { clients: new Map(), inactivation: null };
      result.set(row.equipment_id, state);
    }
    if (!state.clients.has(row.person_id))
      state.clients.set(row.person_id, {
        active:
          typeof row.payload?.ativo === "boolean" ? row.payload.ativo : null,
        reason: String(row.payload?.motivoInativacao || "").trim(),
        at: row.collected_at,
        name: row.person_name,
      });
  }
  for (const state of result.values()) {
    const links = [...state.clients.values()];
    if (links.length && links.every((row) => row.active === false))
      state.inactivation = {
        reason: [
          ...new Set(
            links.map((row) => row.reason || "Motivo não informado no ERP"),
          ),
        ].join(" · "),
        at: links[0].at,
        by: "ERP M8",
        erpStatus: "confirmed",
        source: "m8",
      };
  }
  return result;
}
export function annotateEquipmentClients(clients: any[], state: any) {
  return clients.map((client) => {
    const relation = state?.clients.get(String(client.id));
    return {
      ...client,
      active: relation?.active ?? null,
      inactivation:
        relation?.active === false
          ? {
              reason: relation.reason || "Motivo não informado no ERP",
              at: relation.at,
              by: "ERP M8",
            }
          : null,
    };
  });
}
