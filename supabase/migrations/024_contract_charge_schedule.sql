-- Contract forecasts use the dated fixed/variable charge schedule collected from M8.
-- Keep the existing BI column names, with one aggregated row per contract/month.
CREATE OR REPLACE VIEW public."fContratos" AS
 WITH contracts AS (
 SELECT company_id,id,payload,
   (SELECT COALESCE(sum((item->>'amount')::numeric),0) FROM jsonb_array_elements(payload->'_billingSchedule'->'installments') item) AS valor
 FROM public.m8_commercial_facts
 WHERE kind='fContratos' AND present AND payload->'_billingSchedule'->>'version'='1'
 ), installments AS (
 SELECT contracts.*, (item->>'total')::integer AS parcelas,
   (item->>'amount')::numeric AS installment_value,
   ((item->>'period')||'-01')::date AS month,
   (item->>'number')::bigint AS n
 FROM contracts CROSS JOIN LATERAL jsonb_array_elements(payload->'_billingSchedule'->'installments') item
 )
 SELECT payload->>'descricao' AS "descricao",
 payload->>'tipoContratoId' AS "tipoContratoId",
 payload->>'tipoContratoNome' AS "tipoContratoNome",
 payload->>'estabelecimentoId' AS "estabelecimentoId",
 payload->>'estabelecimentoNome' AS "estabelecimentoNome",
 payload->>'pessoaId' AS "pessoaId",
 payload->>'pessoaNome' AS "pessoaNome",
 payload->>'condicaoPagamentoId' AS "condicaoPagamentoId",
 payload->>'condicaoPagamentoNome' AS "condicaoPagamentoNome",
 payload->>'slaId' AS "slaId",
 payload->>'slaNome' AS "slaNome",
 payload->>'projetoId' AS "projetoId",
 payload->>'projetoNome' AS "projetoNome",
 payload->>'municipioPrestacaoId' AS "municipioPrestacaoId",
 payload->>'municipioPrestacaoNome' AS "municipioPrestacaoNome",
 (payload->>'emissao')::date AS "emissao",
 (payload->>'inicioFaturamento')::date AS "inicioFaturamento",
 (payload->>'inicio')::date AS "inicio",
 (payload->>'final')::date AS "final",
 payload->>'bancoHoras' AS "bancoHoras",
 payload->>'dataBancoHoras' AS "dataBancoHoras",
 payload->>'valorHora' AS "valorHora",
 payload->>'totalHorasValor' AS "totalHorasValor",
 payload->>'periodicidadeHora' AS "periodicidadeHora",
 payload->>'reajusteAutomatico' AS "reajusteAutomatico",
 payload->>'descontoAdimplencia' AS "descontoAdimplencia",
 payload->>'cancelado' AS "cancelado",
 payload->>'canceladoFiltro' AS "canceladoFiltro",
 payload->>'dataCancelamento' AS "dataCancelamento",
 payload->>'motivoCancelamento' AS "motivoCancelamento",
 payload->>'moedaId' AS "moedaId",
 payload->>'moedaNome' AS "moedaNome",
 payload->>'periodicidade' AS "periodicidade",
 payload->>'observacoesNF' AS "observacoesNF",
 payload->>'objeto' AS "objeto",
 payload->>'observacoes' AS "observacoes",
 payload->>'ativo' AS "ativo",
 payload->>'Contrato' AS "Contrato",
 payload->>'CHAVE_CONTRATO' AS "CHAVE_CONTRATO",
 (payload->>'Última Parcela?')::numeric AS "Última Parcela?",
 company_id,id,payload,valor,parcelas AS "Parcelas",installment_value AS "Valor Parcela",
 month::date AS "Competência",n AS "Parcela do Mês",n::text||'/'||parcelas::text AS "Parcela Atual/Total",
 to_char(month,'MM/YYYY') AS "Mês/Ano Competência",
 CASE WHEN position(' - ' IN payload->>'tipoContratoNome')>0 THEN substring(payload->>'tipoContratoNome' FROM position(' - ' IN payload->>'tipoContratoNome')+3) ELSE NULL END AS "Tipo de Contrato"
 FROM installments;
REVOKE ALL ON public."fContratos" FROM PUBLIC,anon,authenticated;
