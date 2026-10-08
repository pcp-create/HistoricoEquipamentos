-- Conversas por instância/telefone e idempotência dos eventos recebidos.
CREATE TABLE public.web_dsu_sessions (
 instance text NOT NULL, phone text NOT NULL, actor_email text,
 state jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(instance,phone)
);
CREATE TABLE public.web_dsu_messages (
 instance text NOT NULL, phone text NOT NULL, message_id text NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(instance,phone,message_id)
);
CREATE INDEX web_dsu_messages_processed ON public.web_dsu_messages(processed_at);
ALTER TABLE public.web_dsu_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_dsu_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_dsu_sessions,public.web_dsu_messages FROM PUBLIC,anon,authenticated;
