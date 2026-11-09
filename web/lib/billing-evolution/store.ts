import "server-only";
import { database } from "../db";
import history from "./history.json";
import { buildEvolution, type LiveMonth } from "./model";
export async function billingEvolution() {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  try {
    const db = database();
    const [data, sync] = await Promise.all([
      db.query<LiveMonth>(
        `WITH documents AS (
    SELECT DISTINCT ON(kind,id) kind,id,company_id,payload FROM m8_commercial_facts
    WHERE present AND kind IN('fFaturamento','fDevolucoesCompra','fDevolucoesOutros') AND company_id IN(1,2,27404) ORDER BY kind,id,company_id
   ), valid AS (
    SELECT kind,CASE WHEN payload->>'empresaId' IN('1','2','27404') THEN payload->>'empresaId' ELSE company_id::text END company,
     left(payload->>'emissao',7) period,(payload->>'totalGeral')::numeric amount
    FROM documents WHERE payload->>'status'='Processado' AND COALESCE(payload->>'estaExcluido','false')<>'true'
     AND payload->>'emissao' ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-' AND payload->>'totalGeral' ~ '^-?[0-9]+(\\.[0-9]+)?$'
     AND (kind='fFaturamento' OR (kind='fDevolucoesCompra' AND payload->>'tipoCompraDescricao' LIKE '%DEVOL%')
       OR (kind='fDevolucoesOutros' AND payload->>'outrosDocumentosOperacaoId' IN('30','82','90','213','280')))
   ), monthly AS (
    SELECT company,period,COALESCE(sum(amount) FILTER(WHERE kind='fFaturamento'),0)::float8 gross,
     COALESCE(sum(amount) FILTER(WHERE kind<>'fFaturamento'),0)::float8 returns,
     count(*) FILTER(WHERE kind='fFaturamento')::int count,
     count(*) FILTER(WHERE kind<>'fFaturamento')::int "returnCount"
    FROM valid WHERE period<=$1 GROUP BY company,period
   ) SELECT *, (gross-returns)::float8 amount FROM monthly ORDER BY company,period`,
        [today.slice(0, 7)],
      ),
      db.query(
        "SELECT company_id,collected_at FROM m8_commercial_facts_sync WHERE kind IN('fFaturamento','fDevolucoesCompra','fDevolucoesOutros') AND company_id IN(1,2,27404)",
      ),
    ]);
    const dates = sync.rows
      .map((row) => new Date(row.collected_at).getTime())
      .filter(Number.isFinite);
    return buildEvolution(
      history,
      data.rows,
      today,
      dates.length ? new Date(Math.min(...dates)).toISOString() : null,
      sync.rows.length < 9
        ? "A integração não confirmou a atualização de todas as empresas. Confira a origem dos valores."
        : null,
    );
  } catch (error) {
    console.error(
      "Consulta de evolução do faturamento indisponível:",
      (error as { code?: string }).code || "connection",
    );
    return buildEvolution(
      history,
      [],
      today,
      null,
      "Não foi possível consultar a integração. Exibindo somente o histórico estático da planilha.",
    );
  }
}
