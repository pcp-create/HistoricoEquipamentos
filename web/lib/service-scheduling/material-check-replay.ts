const key = (item: any) => `${item.item_company}:${item.item_order}:${item.id_m8 ?? item.item_id}`;
/** Reconcile identities only. Never transfer quantities to a different ERP line. */
export function materialCheckReplay(current: any[], submitted: any[], offline: boolean) {
  if (!Array.isArray(submitted) || new Set(submitted.map(key)).size !== submitted.length)
    throw Error("A lista de peças mudou. Reabra a conferência.");
  const actual = new Set(current.map(key)), recorded = new Set(submitted.map(key));
  const added = current.filter(item => !recorded.has(key(item))).map(key);
  const removed = submitted.filter(item => !actual.has(key(item)));
  if (!offline && (added.length || removed.length))
    throw Error("A lista de peças mudou. Reabra a conferência.");
  // A removed line carrying a quantity must remain pending for manual recovery.
  if (removed.some(item => [item.withdrawn, item.returned].some(value => value != null && value !== 0)))
    throw Error("Uma peça com retirada ou devolução registrada não está mais na OS. Preserve a pendência e solicite a conferência ao planejamento.");
  return { added, removed: removed.map(key), patches: new Map(submitted.filter(item => actual.has(key(item))).map(item => [key(item), item])) };
}
