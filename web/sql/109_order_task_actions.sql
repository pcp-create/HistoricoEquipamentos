BEGIN;
CREATE TABLE IF NOT EXISTS public.web_order_task_actions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 active boolean NOT NULL DEFAULT true,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS web_order_task_action_name ON public.web_order_task_actions(lower(trim(name)));
INSERT INTO public.web_order_task_actions(name,created_by) VALUES('Efetuar Fechamento','Sistema'),('Gerar Orçamento','Sistema') ON CONFLICT DO NOTHING;
ALTER TABLE public.web_tasks ADD COLUMN IF NOT EXISTS action_id bigint REFERENCES public.web_order_task_actions(id);
ALTER TABLE public.web_tasks ADD COLUMN IF NOT EXISTS action_name text;
ALTER TABLE public.web_order_task_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_order_task_actions FROM PUBLIC,anon,authenticated;
COMMIT;
