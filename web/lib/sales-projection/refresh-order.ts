import "server-only";
import { database } from "../db";
import { m8Session } from "../service-orders/m8";

// Refresh only after the ERP has confirmed all edit steps. Never replay a write.
export async function refreshProjectionOrder(
  company: number,
  id: string,
  session = m8Session,
) {
  if (![1, 2, 27404].includes(company) || !/^[1-9]\d*$/.test(id))
    throw Error("OS inválida");
  const m8 = await session(company);
  const result = await m8(
    `/v1/assistenciatecnica/ordemservico?Id=${id}&Page=1&PageSize=1`,
  );
  if (
    !Array.isArray(result) ||
    result.length !== 1 ||
    String(result[0]?.id) !== id ||
    !result[0].status ||
    result[0].totalGeral == null
  )
    throw Error("Atualização da OS não confirmada");
  const p = result[0];
  const columns: Record<string, string> = {
    cliente_id: "clienteId",
    cliente_nome: "clienteNome",
    cliente_razao_social: "clienteRazaoSocial",
    data_abertura: "dataAbertura",
    data_entrega_prevista: "dataEntregaPrevista",
    data_faturamento: "dataFaturamento",
    data_atualizacao: "dataAtualizacao",
    tipo_id: "tipoId",
    tipo_nome: "tipoNome",
    situacao_id: "situacaoId",
    situacao_nome: "situacaoNome",
    status_lancamento_id: "statusLancamentoId",
    status_lancamento_nome: "statusLancamentoNome",
    status: "status",
    modalidade_atendimento_id: "modalidadeAtendimentoId",
    equipamento: "equipamento",
    empresa_id: "empresaId",
    total_geral: "totalGeral",
  };
  const entries = Object.entries(columns).filter(([, key]) =>
    Object.hasOwn(p, key),
  );
  const names = entries.map(([name]) => name);
  const values = entries.map(([, key]) => p[key]);
  const client = await database().connect();
  try {
    await client.query("BEGIN READ WRITE");
    await client.query(
      `INSERT INTO m8_ordens_servico(company_id,id_m8,payload,${names.join(",")}) VALUES($1,$2,$3::jsonb,${values.map((_, i) => names[i].startsWith("data_") ? `CASE WHEN $${i+4}::text IS NULL THEN NULL WHEN $${i+4}::text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN $${i+4}::timestamptz ELSE $${i+4}::timestamp AT TIME ZONE 'America/Sao_Paulo' END` : "$" + (i + 4)).join(",")}) ON CONFLICT(company_id,id_m8) DO UPDATE SET payload=m8_ordens_servico.payload || EXCLUDED.payload,${names.map((n) => `${n}=EXCLUDED.${n}`).join(",")} WHERE m8_ordens_servico.data_atualizacao IS NULL OR EXCLUDED.data_atualizacao IS NULL OR m8_ordens_servico.data_atualizacao<=EXCLUDED.data_atualizacao`,
      [company, id, JSON.stringify(p), ...values],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
