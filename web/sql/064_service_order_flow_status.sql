BEGIN;
ALTER TABLE public.service_order_registries DROP CONSTRAINT IF EXISTS service_order_registries_kind_check;
ALTER TABLE public.service_order_registries ADD CONSTRAINT service_order_registries_kind_check CHECK(kind IN ('payment-terms','order-statuses','freight','service-types','service-origins','flow-statuses'));
ALTER TABLE public.registry_manual_updates DROP CONSTRAINT IF EXISTS registry_manual_updates_registry_key_check;
ALTER TABLE public.registry_manual_updates ADD CONSTRAINT registry_manual_updates_registry_key_check CHECK(registry_key IN ('order-types','quote-types','payment-terms','order-statuses','freight','service-types','service-origins','flow-statuses'));
COMMIT;
