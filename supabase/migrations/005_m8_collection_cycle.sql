-- Horímetros no contrato real são strings; preservar inclusive valores não numéricos.
ALTER TABLE public.m8_equipamentos
  ALTER COLUMN horimetro TYPE text USING horimetro::text,
  ALTER COLUMN horimetro_dois TYPE text USING horimetro_dois::text,
  ALTER COLUMN horimetro_tres TYPE text USING horimetro_tres::text;

-- Endpoint separado retorna várias manutenções. Mantém tabela singular legada para auditoria.
CREATE TABLE public.m8_os_manutencoes (
  company_id integer NOT NULL,
  ordem_servico_id bigint NOT NULL,
  id_m8 bigint NOT NULL,
  veiculo_pessoa_id bigint, veiculo_pessoa_nome text, km_atual bigint, box text,
  data_ultima_troca_oleo timestamptz, km_ultima_troca bigint, km_rodado bigint,
  data_proxima_troca_oleo timestamptz, aviso_antecedencia_troca_oleo text,
  observacoes_troca_oleo text, quantidade_combustivel text, condicao_entrada text,
  data_proxima_revisao timestamptz, aviso_antecedencia text, observacoes_revisao text,
  observacao text, avarias text, defeitos text, laudo text,
  payload jsonb NOT NULL, sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,ordem_servico_id,id_m8),
  FOREIGN KEY (company_id,ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id,id_m8)
);
CREATE TABLE public.integracao_m8_os_sync (
  company_id integer NOT NULL, ordem_servico_id bigint NOT NULL,
  summary_status text, inventory_seen_at timestamptz NOT NULL,
  pending boolean NOT NULL DEFAULT true,
  finalized boolean NOT NULL DEFAULT false,
  last_detail_at timestamptz, last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  collections jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  PRIMARY KEY (company_id,ordem_servico_id),
  FOREIGN KEY (company_id,ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id,id_m8),
  CHECK (NOT finalized OR NOT pending)
);
CREATE INDEX integracao_m8_os_sync_pending ON public.integracao_m8_os_sync(company_id,next_attempt_at,last_detail_at) WHERE pending;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['m8_os_manutencoes','integracao_m8_os_sync'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
    END IF;
  END LOOP;
END $$;

-- A listagem repete OS por documentoFiscalId; preserva todos sem escolher um único documento.
CREATE TABLE public.m8_os_documentos_fiscais (
  company_id integer NOT NULL, ordem_servico_id bigint NOT NULL, documento_fiscal_id bigint NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,ordem_servico_id,documento_fiscal_id),
  FOREIGN KEY(company_id,ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id,id_m8)
);
ALTER TABLE public.m8_os_documentos_fiscais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m8_os_documentos_fiscais FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.m8_os_documentos_fiscais FROM anon,authenticated;
END IF; END $$;
