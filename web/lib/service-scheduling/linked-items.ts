import { isNotApproved } from "../material-approval";
export function combineOrderItems(main: any, linked: any, field: "materials" | "services", company: any, orderId: any, linkedCompany: any, linkedOrder: any) {
  const code = field === "materials" ? "produto_id" : "servico_id";
  const active = (i: any) => i.esta_excluido !== true && (field !== "materials" || !isNotApproved(i.aprovado));
  const primary = (main?.[field] || []).filter(active);
  const secondary = (linked?.[field] || []).filter(active);
  const codes = new Set(primary.filter((i: any) => i[code] != null).map((i: any) => String(i[code])));
  const summarize = (items: any[]) => {
    const units = [...new Set(items.map(i => String(i.unidade_nome || "").trim().toUpperCase()))];
    const complete = items.every(i => i.quantidade != null && String(i.quantidade).trim() !== "" && Number.isFinite(Number(i.quantidade)));
    return {quantity: complete ? items.reduce((sum, i) => sum + Number(i.quantidade), 0) : null, units};
  };
  const annotate = (items: any[], c: any, o: any, number: any, isLinked: boolean) => items.map(i => {
    let inconsistency = null;
    if (!isLinked && field === "materials" && i.produto_id != null) {
      const other = secondary.filter((v: any) => String(v.produto_id) === String(i.produto_id));
      if (other.length) {
        const a = summarize(primary.filter((v: any) => String(v.produto_id) === String(i.produto_id))), b = summarize(other);
        if (a.units.length !== 1 || b.units.length !== 1 || !a.units[0] || a.units[0] !== b.units[0]) inconsistency = {reason:"unit", main:a.quantity, linked:b.quantity};
        else if (a.quantity == null || b.quantity == null) inconsistency = {reason:"missing", main:a.quantity, linked:b.quantity};
        else if (Math.abs(a.quantity - b.quantity) > 0.000001) inconsistency = {reason:"quantity", main:a.quantity, linked:b.quantity};
      }
    }
    return {...i,item_company:c,item_order:String(o),source_number:number || o,source_linked:isLinked,quantity_inconsistency:inconsistency};
  });
  return [...annotate(primary,company,orderId,main?.order?.numero_sequencia,false), ...annotate(secondary.filter((i: any) => i[code] == null || !codes.has(String(i[code]))),linkedCompany,linkedOrder,linked?.order?.numero_sequencia,true)];
}
