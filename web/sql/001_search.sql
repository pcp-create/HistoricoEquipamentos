-- Internal search projection. Maintained by database triggers, including the existing runner.
CREATE TABLE IF NOT EXISTS public.web_history_search (
  company_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('order','product','equipment')),
  id_m8 bigint NOT NULL,
  ordem_servico_id bigint NOT NULL,
  document text NOT NULL,
  PRIMARY KEY(company_id,kind,ordem_servico_id,id_m8)
);
CREATE INDEX IF NOT EXISTS web_history_search_order ON public.web_history_search(company_id,ordem_servico_id);
ALTER TABLE public.web_history_search ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_history_search FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.web_history_search FROM anon,authenticated;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.web_history_document(record jsonb) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT translate(lower(COALESCE(string_agg(
    COALESCE(value,'') || CASE
      WHEN value ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN ' ' || to_char(value::timestamptz AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')
      WHEN jsonb_typeof(record->key)='number' THEN ' ' || replace(value,'.',',')
      ELSE '' END, ' '),'')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñ','aaaaaaeeeeiiiiooooouuuucn')
  FROM jsonb_each_text(record - 'payload');
$$;
CREATE OR REPLACE FUNCTION public.web_history_update_search() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE record jsonb; entity text := TG_ARGV[0];
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.web_history_search WHERE company_id=OLD.company_id AND kind=entity AND id_m8=OLD.id_m8 AND ordem_servico_id=COALESCE((to_jsonb(OLD)->>'ordem_servico_id')::bigint,OLD.id_m8);
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    DELETE FROM public.web_history_search WHERE company_id=OLD.company_id AND kind=entity AND id_m8=OLD.id_m8 AND ordem_servico_id=COALESCE((to_jsonb(OLD)->>'ordem_servico_id')::bigint,OLD.id_m8);
  END IF;
  record := to_jsonb(NEW);
  IF entity='product' AND (record->>'esta_excluido')::boolean IS TRUE THEN
    DELETE FROM public.web_history_search WHERE company_id=NEW.company_id AND kind=entity AND id_m8=NEW.id_m8 AND ordem_servico_id=COALESCE((record->>'ordem_servico_id')::bigint,NEW.id_m8);
    RETURN NEW;
  END IF;
  INSERT INTO public.web_history_search(company_id,kind,id_m8,ordem_servico_id,document)
  VALUES(NEW.company_id,entity,NEW.id_m8,COALESCE((record->>'ordem_servico_id')::bigint,NEW.id_m8),public.web_history_document(record))
  ON CONFLICT(company_id,kind,ordem_servico_id,id_m8) DO UPDATE SET ordem_servico_id=EXCLUDED.ordem_servico_id,document=EXCLUDED.document;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_history_search_order ON public.m8_ordens_servico;
CREATE TRIGGER web_history_search_order AFTER INSERT OR UPDATE OR DELETE ON public.m8_ordens_servico FOR EACH ROW EXECUTE FUNCTION public.web_history_update_search('order');
DROP TRIGGER IF EXISTS web_history_search_product ON public.m8_os_produtos;
CREATE TRIGGER web_history_search_product AFTER INSERT OR UPDATE OR DELETE ON public.m8_os_produtos FOR EACH ROW EXECUTE FUNCTION public.web_history_update_search('product');
DROP TRIGGER IF EXISTS web_history_search_equipment ON public.m8_equipamentos;
CREATE TRIGGER web_history_search_equipment AFTER INSERT OR UPDATE OR DELETE ON public.m8_equipamentos FOR EACH ROW EXECUTE FUNCTION public.web_history_update_search('equipment');
INSERT INTO public.web_history_search SELECT company_id,'order',id_m8,id_m8,public.web_history_document(to_jsonb(o)) FROM public.m8_ordens_servico o
ON CONFLICT(company_id,kind,ordem_servico_id,id_m8) DO UPDATE SET ordem_servico_id=EXCLUDED.ordem_servico_id,document=EXCLUDED.document;
INSERT INTO public.web_history_search SELECT company_id,'product',id_m8,ordem_servico_id,public.web_history_document(to_jsonb(p)) FROM public.m8_os_produtos p WHERE esta_excluido IS NOT TRUE
ON CONFLICT(company_id,kind,ordem_servico_id,id_m8) DO UPDATE SET ordem_servico_id=EXCLUDED.ordem_servico_id,document=EXCLUDED.document;
INSERT INTO public.web_history_search SELECT company_id,'equipment',id_m8,ordem_servico_id,public.web_history_document(to_jsonb(e)) FROM public.m8_equipamentos e
ON CONFLICT(company_id,kind,ordem_servico_id,id_m8) DO UPDATE SET ordem_servico_id=EXCLUDED.ordem_servico_id,document=EXCLUDED.document;
REVOKE ALL ON FUNCTION public.web_history_document(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.web_history_update_search() FROM PUBLIC;
