BEGIN;
ALTER TABLE public.web_field_time_requests ADD COLUMN IF NOT EXISTS applied_at timestamptz;
ALTER TABLE public.web_field_time_requests ADD COLUMN IF NOT EXISTS applied_by text;
DROP INDEX IF EXISTS public.web_field_one_time_request;
DROP INDEX IF EXISTS public.web_field_one_legacy_request;
CREATE UNIQUE INDEX IF NOT EXISTS web_field_one_time_request ON public.web_field_time_requests(session_id) WHERE status='pending' AND applied_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS web_field_one_legacy_request ON public.web_field_time_requests(legacy_event_id) WHERE status='pending' AND applied_at IS NULL;
COMMIT;
