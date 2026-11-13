BEGIN;
CREATE TABLE IF NOT EXISTS public.web_contact_job_types (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 m8_id integer NOT NULL UNIQUE CHECK(m8_id>0),
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS web_contact_job_types_name_unique ON public.web_contact_job_types(lower(trim(name)));
ALTER TABLE public.web_contact_job_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_contact_job_types FROM PUBLIC,anon,authenticated;
-- Reuse only descriptions and IDs already returned by the ERP.
INSERT INTO public.web_contact_job_types(name,m8_id,updated_by)
SELECT DISTINCT ON (cargo_id) trim(job_title),cargo_id,'sistema:importacao-m8' FROM public.web_customer_contacts
WHERE m8_id IS NOT NULL AND cargo_id>0 AND length(trim(job_title)) BETWEEN 1 AND 160
ORDER BY cargo_id,created_at DESC,id
ON CONFLICT DO NOTHING;
COMMIT;
