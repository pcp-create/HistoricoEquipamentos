CREATE TABLE public.web_projection_sync_jobs (
 id uuid PRIMARY KEY, requested_by text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL CHECK(state IN('queued','running','complete','failed')),
 stage text NOT NULL DEFAULT 'Aguardando integrador',
 started_at timestamptz, finished_at timestamptz, message text
);
CREATE UNIQUE INDEX projection_sync_one_active ON public.web_projection_sync_jobs((true)) WHERE state IN('queued','running');
CREATE TABLE public.web_projection_sync_worker (
 id integer PRIMARY KEY CHECK(id=1), heartbeat_at timestamptz NOT NULL
);
ALTER TABLE public.web_projection_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_projection_sync_worker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_projection_sync_jobs, public.web_projection_sync_worker FROM PUBLIC,anon,authenticated;
