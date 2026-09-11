import type { M8Client } from './client.js';
import { id, record } from './ordemServico.js';
import { SafeError } from '../utils/logger.js';
export const SUMMARY_ENDPOINT = '/v1/assistenciatecnica/ordemservico';
export interface InventoryEntry { id: string; status: string | null; occurrences: number }
export function parseInventory(body: unknown): InventoryEntry[] {
  if (!record(body) || !Array.isArray(body.data)) throw new SafeError('Inventário M8 inesperado: esperado data[]');
  if (body.errors != null && (!Array.isArray(body.errors) || body.errors.length)) throw new SafeError('Inventário M8 retornou errors (conteúdo omitido)');
  const entries = new Map<string, InventoryEntry>();
  for (const row of body.data) {
    if (!record(row)) throw new SafeError('Registro de inventário inválido');
    if (['produtos','servicos','apontamentos','equipamentoProduto','checklistRespostas','anexos','manutencao'].some(key => key in row)) {
      throw new SafeError('Listagem resumida passou a incluir filhos; revisar contrato antes de usar inventário');
    }
    if (typeof row.status !== 'string' || !['Pendente','Processado','Cancelado','Aprovado'].includes(row.status)) {
      throw new SafeError('Status não reconhecido na listagem resumida; não presumir estado terminal');
    }
    const key = id(row.id), previous = entries.get(key);
    if (previous) {
      previous.occurrences++;
      // Do not choose a terminal state from contradictory duplicate rows.
      if (previous.status !== row.status) previous.status = null;
    } else entries.set(key, { id: key, status: row.status, occurrences: 1 });
  }
  return [...entries.values()];
}
export async function fetchInventory(client: Pick<M8Client, 'get'>): Promise<InventoryEntry[]> {
  // Explicitly authorized unpaginated SUMMARY endpoint. Never use completa here.
  return parseInventory(await client.get(SUMMARY_ENDPOINT, { Page: 0, PageSize: 0 }));
}
