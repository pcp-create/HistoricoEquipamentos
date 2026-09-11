CREATE TABLE public.m8_equipment_catalog (
 company_id integer NOT NULL CHECK(company_id=1), equipment_id bigint NOT NULL, name text NOT NULL, alias text,
 model text, models text[] NOT NULL DEFAULT '{}', serial text, serial_source text, brand text,
 blocked text, issues jsonb NOT NULL DEFAULT '[]', payload jsonb NOT NULL, present boolean NOT NULL DEFAULT true,
 collected_at timestamptz NOT NULL, PRIMARY KEY(equipment_id)
);
CREATE INDEX m8_equipment_catalog_serial ON public.m8_equipment_catalog(company_id,serial);
CREATE TABLE public.m8_customer_directory (
 company_id integer NOT NULL, person_id bigint NOT NULL, name text, document text, payload jsonb NOT NULL,
 collected_at timestamptz NOT NULL, PRIMARY KEY(company_id,person_id)
);
CREATE TABLE public.m8_person_equipment (
 company_id integer NOT NULL, person_id bigint NOT NULL, link_id bigint NOT NULL, equipment_id bigint NOT NULL,
 person_name text, equipment_name text, payload jsonb NOT NULL, present boolean NOT NULL DEFAULT true,
 collected_at timestamptz NOT NULL, PRIMARY KEY(company_id,person_id,link_id)
);
CREATE INDEX m8_person_equipment_lookup ON public.m8_person_equipment(company_id,person_id,equipment_id) WHERE present;
CREATE TABLE public.m8_equipment_person_queue (
 company_id integer NOT NULL, person_id bigint NOT NULL, attempted_at timestamptz, checked_at timestamptz,
 next_at timestamptz NOT NULL DEFAULT now(), error text, PRIMARY KEY(company_id,person_id)
);
CREATE TABLE public.m8_equipment_sync (
 company_id integer PRIMARY KEY,catalog_at timestamptz,seed_at timestamptz,linked_at timestamptz,error text
);
CREATE TABLE public.m8_order_equipment_links (
 company_id integer NOT NULL,order_id bigint NOT NULL,equipment_id bigint NOT NULL,
 method text NOT NULL CHECK(method IN ('explicit','serial','observation','review')),
 evidence jsonb NOT NULL,rule_version integer NOT NULL DEFAULT 1,
 stale boolean NOT NULL DEFAULT false,evaluated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,order_id,equipment_id),
 FOREIGN KEY(company_id,order_id) REFERENCES public.m8_ordens_servico(company_id,id_m8) ON DELETE CASCADE,
 FOREIGN KEY(equipment_id) REFERENCES public.m8_equipment_catalog(equipment_id)
);
CREATE INDEX m8_order_equipment_links_reverse ON public.m8_order_equipment_links(company_id,equipment_id,order_id);
CREATE VIEW public.m8_equipment_linked AS
 SELECT l.*,e.name,e.model,e.serial,e.serial_source,e.collected_at
 FROM public.m8_order_equipment_links l JOIN public.m8_equipment_catalog e ON e.equipment_id=l.equipment_id
 WHERE NOT l.stale AND e.present AND l.method<>'review';
CREATE FUNCTION public.m8_equipment_links_stale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='m8_ordens_servico' THEN
  IF (OLD.cliente_id,OLD.observacao,OLD.numero_serie,OLD.serie,OLD.produto_equipamento_id,OLD.modelo_equipamento)
    IS DISTINCT FROM (NEW.cliente_id,NEW.observacao,NEW.numero_serie,NEW.serie,NEW.produto_equipamento_id,NEW.modelo_equipamento)
  THEN UPDATE public.m8_order_equipment_links SET stale=true WHERE company_id=NEW.company_id AND order_id=NEW.id_m8; END IF;
 ELSE
  IF TG_OP='DELETE' THEN
   UPDATE public.m8_order_equipment_links SET stale=true WHERE company_id=OLD.company_id AND order_id=OLD.ordem_servico_id;
  ELSE
   UPDATE public.m8_order_equipment_links SET stale=true WHERE company_id=NEW.company_id AND order_id=NEW.ordem_servico_id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER m8_equipment_links_order_stale AFTER UPDATE ON public.m8_ordens_servico FOR EACH ROW EXECUTE FUNCTION public.m8_equipment_links_stale();
CREATE TRIGGER m8_equipment_links_children_stale AFTER INSERT OR UPDATE OR DELETE ON public.m8_equipamentos FOR EACH ROW EXECUTE FUNCTION public.m8_equipment_links_stale();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['m8_equipment_catalog','m8_customer_directory','m8_person_equipment','m8_equipment_person_queue','m8_equipment_sync','m8_order_equipment_links'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t); END IF;
 END LOOP;
END $$;
REVOKE ALL ON public.m8_equipment_linked FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m8_equipment_links_stale() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.m8_equipment_linked FROM anon,authenticated; END IF; END $$;

CREATE TRIGGER m8_equipment_links_maintenance_stale AFTER INSERT OR UPDATE OR DELETE ON public.m8_os_manutencoes FOR EACH ROW EXECUTE FUNCTION public.m8_equipment_links_stale();
CREATE FUNCTION public.m8_equipment_registry_stale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='m8_equipment_catalog' THEN
  IF (OLD.name,OLD.model,OLD.serial,OLD.present) IS DISTINCT FROM (NEW.name,NEW.model,NEW.serial,NEW.present)
  THEN UPDATE public.m8_order_equipment_links SET stale=true WHERE equipment_id=NEW.equipment_id; END IF;
 ELSE
  IF TG_OP='DELETE' THEN
   UPDATE public.m8_order_equipment_links SET stale=true WHERE company_id=OLD.company_id AND equipment_id=OLD.equipment_id;
  ELSIF TG_OP='INSERT' OR (OLD.equipment_id,OLD.person_id,OLD.present) IS DISTINCT FROM (NEW.equipment_id,NEW.person_id,NEW.present) THEN
   UPDATE public.m8_order_equipment_links SET stale=true WHERE company_id=NEW.company_id AND equipment_id=NEW.equipment_id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER m8_equipment_registry_changed AFTER UPDATE ON public.m8_equipment_catalog FOR EACH ROW EXECUTE FUNCTION public.m8_equipment_registry_stale();
CREATE TRIGGER m8_equipment_person_changed AFTER INSERT OR UPDATE OR DELETE ON public.m8_person_equipment FOR EACH ROW EXECUTE FUNCTION public.m8_equipment_registry_stale();
REVOKE ALL ON FUNCTION public.m8_equipment_registry_stale() FROM PUBLIC;
