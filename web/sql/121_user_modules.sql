ALTER TABLE public.web_user_access ADD COLUMN IF NOT EXISTS job_titles jsonb;
ALTER TABLE public.web_user_access ADD COLUMN IF NOT EXISTS modules jsonb;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='web_user_job_titles_array') THEN
  ALTER TABLE public.web_user_access ADD CONSTRAINT web_user_job_titles_array CHECK(job_titles IS NULL OR jsonb_typeof(job_titles)='array');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='web_user_modules_array') THEN
  ALTER TABLE public.web_user_access ADD CONSTRAINT web_user_modules_array CHECK(modules IS NULL OR jsonb_typeof(modules)='array');
 END IF;
END $$;
-- Existing profiles retain their current access until explicitly configured.

-- Older installations already have modules with a narrower validation and NOT NULL.
-- Retain legacy identifiers while accepting the current module registry.
ALTER TABLE public.web_user_access ALTER COLUMN modules DROP NOT NULL;
ALTER TABLE public.web_user_access DROP CONSTRAINT IF EXISTS web_user_access_modules_valid;
ALTER TABLE public.web_user_access ADD CONSTRAINT web_user_access_modules_valid
 CHECK (modules IS NULL OR (jsonb_typeof(modules)='array' AND modules <@
 '["crm","assistencia-tecnica","suprimentos","equipamentos","tarefas","programacao","tecnico","portal-tecnico","visitas","gestao-visitas","oficina","almoxarifado","calendario","administracao"]'::jsonb));
