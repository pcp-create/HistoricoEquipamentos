CREATE TABLE public.web_equipment_settings (
 equipment_id bigint PRIMARY KEY REFERENCES public.m8_equipment_catalog(equipment_id),
 document jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL
);
CREATE TABLE public.web_equipment_plans (
 id uuid PRIMARY KEY, equipment_id bigint NOT NULL REFERENCES public.m8_equipment_catalog(equipment_id),
 document jsonb NOT NULL, version integer NOT NULL DEFAULT 1, archived boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL
);
CREATE INDEX web_equipment_plans_equipment ON public.web_equipment_plans(equipment_id) WHERE NOT archived;
CREATE TABLE public.web_equipment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, equipment_id bigint NOT NULL REFERENCES public.m8_equipment_catalog(equipment_id),
 plan_id uuid REFERENCES public.web_equipment_plans(id),kind text NOT NULL CHECK(kind IN('settings','plan','maintenance','archive')),
 document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL,display_name text NOT NULL
);
CREATE INDEX web_equipment_events_equipment ON public.web_equipment_events(equipment_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['web_equipment_settings','web_equipment_plans','web_equipment_events'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t); END IF;
 END LOOP;
END $$;
