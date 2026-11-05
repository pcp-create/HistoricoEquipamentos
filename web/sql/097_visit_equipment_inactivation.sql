CREATE TABLE IF NOT EXISTS public.web_visit_equipment_inactivations (
 customer_key text NOT NULL,equipment_key text NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(customer_key,equipment_key)
);
ALTER TABLE public.web_visit_equipment_inactivations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_visit_equipment_inactivations FROM PUBLIC,anon,authenticated;
