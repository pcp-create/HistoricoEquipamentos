BEGIN;
ALTER TABLE public.m8_order_type_catalog ADD COLUMN IF NOT EXISTS equipment_required boolean;
UPDATE public.m8_order_type_catalog SET equipment_required=(id<>6) WHERE equipment_required IS NULL;
ALTER TABLE public.m8_order_type_catalog ALTER COLUMN equipment_required SET DEFAULT true;
ALTER TABLE public.m8_order_type_catalog ALTER COLUMN equipment_required SET NOT NULL;
COMMIT;
