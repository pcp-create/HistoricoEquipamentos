export type OrderType = { id: string; name: string; active: boolean; customer_equipment_only?: boolean };
export function orderTypeRows(body: unknown, nameField: "nome" | "descricao" = "nome"): OrderType[] {
 const b = body as {data?: unknown; errors?: unknown};
 if(!b || !Array.isArray(b.data) || (b.errors != null && (!Array.isArray(b.errors) || b.errors.length))) throw new Error("Resposta M8 inválida");
 const rows = new Map<string,OrderType>();
 for(const row of b.data) {
  if(!row || !/^[1-9]\d*$/.test(String(row.id)) || typeof row[nameField] !== "string" || !row[nameField].trim() || typeof row.ativo !== "boolean") throw new Error("Tipo de OS inválido");
  const value = {id:String(row.id),name:row[nameField].trim(),active:row.ativo,...(nameField==="nome"&&typeof row.buscarEquipamentoPorCliente==="boolean"?{customer_equipment_only:row.buscarEquipamentoPorCliente}:{})};
  const previous=rows.get(value.id);
  if(previous && JSON.stringify(previous)!==JSON.stringify(value)) throw new Error("ID duplicado com dados divergentes");
  rows.set(value.id,value);
 }
 return [...rows.values()];
}
