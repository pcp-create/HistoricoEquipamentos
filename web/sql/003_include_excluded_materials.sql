-- Include soft-deleted materials in historical searches, without changing consumption calculations.
LOCK TABLE public.m8_os_produtos IN SHARE ROW EXCLUSIVE MODE;
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
  INSERT INTO public.web_history_search(company_id,kind,id_m8,ordem_servico_id,document)
  VALUES(NEW.company_id,entity,NEW.id_m8,COALESCE((record->>'ordem_servico_id')::bigint,NEW.id_m8),public.web_history_document(record))
  ON CONFLICT(company_id,kind,ordem_servico_id,id_m8) DO UPDATE SET ordem_servico_id=EXCLUDED.ordem_servico_id,document=EXCLUDED.document;
  RETURN NEW;
END $$;

INSERT INTO public.web_history_search SELECT company_id,'product',id_m8,ordem_servico_id,public.web_history_document(to_jsonb(p)) FROM public.m8_os_produtos p WHERE esta_excluido IS TRUE
ON CONFLICT(company_id,kind,ordem_servico_id,id_m8) DO UPDATE SET document=EXCLUDED.document;
