-- Tipos observados na API real em 2026-09-11 (empresas 1, 2, 27404).
-- Preserva códigos/valores; não presume o significado de enum ou faturado.
-- Payload original é preferido para recuperar um campo anteriormente incompatível.
-- Se houver valor antigo incompatível, a migration falha em vez de inventar conversão.
ALTER TABLE public.m8_ordens_servico
  ALTER COLUMN status_aprovacao TYPE bigint
  USING COALESCE(payload->>'statusAprovacao', status_aprovacao)::bigint;
ALTER TABLE public.m8_os_produtos
  ALTER COLUMN tipo_contrato TYPE bigint
  USING COALESCE(payload->>'tipoContrato', tipo_contrato)::bigint,
  ALTER COLUMN faturado TYPE numeric
  USING COALESCE(payload->>'faturado', faturado::text)::numeric,
  ALTER COLUMN aprovado TYPE text
  USING COALESCE(payload->>'aprovado', aprovado::text);
