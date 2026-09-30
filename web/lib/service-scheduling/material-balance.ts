export type MaterialWithdrawal = {
  operationId: string | null;
  position: number | null;
  quantity: number;
  by: string;
  name: string;
  at: string;
};
export const materialQuantity = (value: unknown) => Math.round(Number(value || 0) * 1000) / 1000;
export function materialWithdrawals(usage: any): MaterialWithdrawal[] {
  if (Array.isArray(usage?.allocations)) return usage.allocations;
  if (!usage || Number(usage.withdrawn) <= 0) return [];
  return [{ operationId: usage.operation_id || null, position: usage.position || null,
    quantity: Number(usage.withdrawn), by: usage.withdrawn_by || usage.updated_by,
    name: usage.withdrawn_name || usage.display_name || usage.updated_by,
    at: usage.withdrawn_at || usage.updated_at }];
}
export function materialBalance(item: any, operationId: string) {
  const withdrawals = materialWithdrawals(item.usage);
  const own = materialQuantity(withdrawals.find(row => row.operationId === operationId)?.quantity);
  const total = materialQuantity(item.usage?.withdrawn);
  const reserved = materialQuantity(item.quantidade);
  const available = Math.max(0, materialQuantity(reserved - total));
  return { withdrawals, own, total, reserved, available, maximum: materialQuantity(own + available) };
}
