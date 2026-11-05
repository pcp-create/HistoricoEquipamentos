CREATE TABLE IF NOT EXISTS public.web_workshop_component_types(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS web_workshop_component_name ON public.web_workshop_component_types(lower(trim(name))) WHERE active;
ALTER TABLE public.web_workshop_component_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_workshop_component_types FROM PUBLIC,anon,authenticated;
DROP INDEX IF EXISTS public.web_workshop_open_equipment;
CREATE UNIQUE INDEX web_workshop_open_equipment ON public.web_workshop_visits(equipment_id)
 WHERE exited_at IS NULL AND reconciled_out_at IS NULL AND COALESCE(source->>'entryKind','equipment')='equipment';
CREATE INDEX IF NOT EXISTS web_workshop_open_components ON public.web_workshop_visits(equipment_id)
 WHERE exited_at IS NULL AND reconciled_out_at IS NULL AND source->>'entryKind'='component';
