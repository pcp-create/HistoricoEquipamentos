ALTER TABLE public.web_user_access DROP CONSTRAINT IF EXISTS web_user_access_modules_valid;
ALTER TABLE public.web_user_access ADD CONSTRAINT web_user_access_modules_valid
 CHECK (modules IS NULL OR (jsonb_typeof(modules)='array' AND modules <@
 '["crm","assistencia-tecnica","suprimentos","equipamentos","tarefas","programacao","tecnico","portal-tecnico","visitas","gestao-visitas","oficina","almoxarifado","calendario","administracao","configuracoes"]'::jsonb));
-- One-time transition preserves previous access. Future selections are independent.
UPDATE public.web_user_access SET modules=modules || '["configuracoes"]'::jsonb
 WHERE modules IS NOT NULL AND NOT modules ? 'configuracoes'
 AND (role='admin' OR modules ? 'administracao');
