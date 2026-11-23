ALTER TABLE public.web_user_access DROP CONSTRAINT IF EXISTS web_user_access_modules_valid;
ALTER TABLE public.web_user_access ADD CONSTRAINT web_user_access_modules_valid
 CHECK (modules IS NULL OR (jsonb_typeof(modules)='array' AND modules <@
 '["crm","assistencia-tecnica","suprimentos","equipamentos","tarefas","programacao","tecnico","portal-tecnico","visitas","gestao-visitas","oficina","almoxarifado","calendario","administracao"]'::jsonb));
-- One-time transition: retain existing management access; subsequent edits use the flag.
UPDATE public.web_user_access SET modules=modules || '["gestao-visitas"]'::jsonb
 WHERE role IN ('admin','manager') AND modules IS NOT NULL AND NOT modules ? 'gestao-visitas';
