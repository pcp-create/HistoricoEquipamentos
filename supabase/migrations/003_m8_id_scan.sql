-- Retomada por ID é separada do checkpoint temporal: lacunas também são registradas.
CREATE TABLE public.integracao_m8_id_scan (
  company_id integer NOT NULL,
  from_id integer NOT NULL CHECK (from_id > 0),
  to_id integer NOT NULL CHECK (to_id >= from_id),
  last_id integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('EXECUTANDO','PAUSADO','CONCLUIDO','ERRO')),
  PRIMARY KEY (company_id, from_id, to_id),
  CHECK (last_id >= from_id - 1 AND last_id <= to_id)
);
ALTER TABLE public.integracao_m8_id_scan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_m8_id_scan FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.integracao_m8_id_scan FROM anon, authenticated;
  END IF;
END $$;
