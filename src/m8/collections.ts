import type { M8Client } from './client.js';
import { SUMMARY_ENDPOINT } from './inventory.js';
import { id, record } from './ordemServico.js';
import type { M8OrdemServicoCompleta } from './types.js';
import { SafeError } from '../utils/logger.js';
export const endpoints = {
  produtos: 'produto', servicos: 'servico', equipamentos: 'equipamento',
  manutencoes: 'manutencao', apontamentos: 'apontamentohora',
  checklistRespostas: 'checklistpergunta', anexos: 'anexo',
} as const;
export type Collection = keyof typeof endpoints;
export type Children = Record<Collection, Record<string, unknown>[]>;
export const collectionNames = Object.keys(endpoints) as Collection[];
export function listData(body: unknown): Record<string, unknown>[] {
  if (!record(body) || !Array.isArray(body.data) || !body.data.every(record)) throw new SafeError('Esperado objeto com data[] de registros');
  if (body.errors != null && (!Array.isArray(body.errors) || body.errors.length)) throw new SafeError('M8 retornou errors (conteúdo omitido)');
  return body.data;
}
const stable = (row: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b]) => a.localeCompare(b))));
export function uniqueRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = id(row.id), previous = seen.get(key);
    if (previous && stable(previous) !== stable(row)) throw new SafeError('Registros repetidos com dados divergentes; não escolher uma versão silenciosamente');
    seen.set(key, row);
  }
  return [...seen.values()];
}
export interface HeaderSnapshot { header: M8OrdemServicoCompleta; fiscalDocumentIds: string[] }
export function summaryHeaders(body: unknown): HeaderSnapshot[] {
  const groups = new Map<string, HeaderSnapshot>();
  for (const row of listData(body)) {
    if (['produtos','servicos','apontamentos','equipamentoProduto','manutencao','anexos','checklistRespostas'].some(key => key in row)) throw new SafeError('Endpoint resumido contém coleções inesperadas');
    if (!['Pendente','Processado','Cancelado','Aprovado'].includes(String(row.status))) throw new SafeError('Status da OS não reconhecido');
    const key = id(row.id);
    const documentId = row.documentoFiscalId == null ? null : id(row.documentoFiscalId);
    const normalized = { ...row, documentoFiscalId: null } as M8OrdemServicoCompleta;
    const previous = groups.get(key);
    if (previous) {
      if (stable(previous.header) !== stable(normalized)) throw new SafeError('Cabeçalhos duplicados divergem além de documentoFiscalId; validar contrato');
      if (documentId !== null && !previous.fiscalDocumentIds.includes(documentId)) previous.fiscalDocumentIds.push(documentId);
    } else groups.set(key, { header: normalized, fiscalDocumentIds: documentId === null ? [] : [documentId] });
  }
  for (const snapshot of groups.values()) {
    snapshot.header.documentoFiscalId = snapshot.fiscalDocumentIds.length === 1 ? snapshot.fiscalDocumentIds[0]! : null;
  }
  return [...groups.values()];
}
export async function fetchHeader(client: Pick<M8Client,'get'>, orderId: string): Promise<HeaderSnapshot> {
  const body = await client.get(SUMMARY_ENDPOINT, { Id: orderId, Page: 1, PageSize: 100 });
  if (listData(body).length >= 100) throw new SafeError('Cabeçalho excedeu limite da consulta por ID; validar duplicações');
  const rows = summaryHeaders(body);
  if (rows.length !== 1 || id(rows[0]!.header.id) !== orderId) throw new SafeError('Consulta de cabeçalho por ID não retornou uma OS correspondente');
  return rows[0]!;
}

export async function fetchCollection(client: Pick<M8Client,'get'>, orderId: string, name: Collection): Promise<Record<string, unknown>[]> {
  const path = `${SUMMARY_ENDPOINT}/${orderId}/${endpoints[name]}`;
  async function request(excluded?: boolean) {
    const rows = listData(await client.get(path, { Page: 0, PageSize: 0, ...(excluded === undefined ? {} : { EstaExcluido: excluded }) }));
    if (rows.length > 5000) throw new SafeError('Coleção de uma OS excedeu 5000 itens; revisar estratégia antes de importar');
    for (const row of rows) {
      if (row.ordemServicoId != null && id(row.ordemServicoId) !== orderId) throw new SafeError('Filho pertence a outra OS; página recusada');
      if (excluded !== undefined && row.estaExcluido !== excluded) throw new SafeError('Filtro EstaExcluido não respeitado; preservar auditoria e revisar API');
    }
    return rows;
  }
  // No pagination over the whole database: each request is scoped to a single known OS.
  const rows = name === 'produtos' ? [...await request(false), ...await request(true)] : await request();
  return uniqueRows(rows);
}
