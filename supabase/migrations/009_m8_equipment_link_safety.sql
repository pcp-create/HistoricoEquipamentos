-- Revalidate inferred ownership/serial at read time as well as during scheduled reconciliation.
CREATE OR REPLACE VIEW public.m8_equipment_linked AS
 SELECT l.*,e.name,e.model,e.serial,e.serial_source,e.collected_at
 FROM public.m8_order_equipment_links l JOIN public.m8_equipment_catalog e ON e.equipment_id=l.equipment_id
 WHERE NOT l.stale AND e.present AND l.method<>'review'
 AND (l.method='explicit' OR (e.serial=l.evidence->>'value' AND EXISTS(
  SELECT 1 FROM public.m8_person_equipment p JOIN public.m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id
  WHERE p.company_id=l.company_id AND p.person_id=o.cliente_id AND p.equipment_id=l.equipment_id AND p.present)));
CREATE OR REPLACE FUNCTION public.m8_equipment_links_stale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='m8_ordens_servico' THEN
  IF (OLD.cliente_id,OLD.observacao,OLD.equipamento,OLD.numero_serie,OLD.serie,OLD.produto_equipamento_id,OLD.modelo_equipamento)
    IS DISTINCT FROM (NEW.cliente_id,NEW.observacao,NEW.equipamento,NEW.numero_serie,NEW.serie,NEW.produto_equipamento_id,NEW.modelo_equipamento)
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
CREATE OR REPLACE FUNCTION public.m8_equipment_registry_stale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='m8_equipment_catalog' THEN
  IF (OLD.name,OLD.model,OLD.serial,OLD.present) IS DISTINCT FROM (NEW.name,NEW.model,NEW.serial,NEW.present)
  THEN UPDATE public.m8_order_equipment_links SET stale=true WHERE equipment_id=NEW.equipment_id; END IF;
 ELSE
  IF TG_OP IN ('DELETE','UPDATE') THEN
   UPDATE public.m8_order_equipment_links SET stale=true WHERE company_id=OLD.company_id AND equipment_id=OLD.equipment_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
   UPDATE public.m8_order_equipment_links SET stale=true WHERE company_id=NEW.company_id AND equipment_id=NEW.equipment_id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
