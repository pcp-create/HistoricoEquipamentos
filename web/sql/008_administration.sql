CREATE TABLE public.web_user_access (
 email text PRIMARY KEY CHECK(email=lower(email)),role text NOT NULL DEFAULT 'user' CHECK(role IN('admin','user')),
 enabled boolean NOT NULL DEFAULT true, display_name text, user_id text,
 last_login_at timestamptz,last_seen_at timestamptz,last_logout_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL
);
CREATE TABLE public.web_access_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event text NOT NULL,
 email text NOT NULL,actor text,created_at timestamptz NOT NULL DEFAULT now(),details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX web_access_events_time ON public.web_access_events(created_at DESC);
ALTER TABLE public.web_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_user_access,public.web_access_events FROM PUBLIC,anon,authenticated;
INSERT INTO public.web_user_access(email,role,updated_by) VALUES('guih.waltrick@gmail.com','admin','initial-setup');
