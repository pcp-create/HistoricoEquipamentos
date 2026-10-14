ALTER TABLE web_user_access ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL
 DEFAULT '["crm","assistencia-tecnica","suprimentos","equipamentos","tarefas"]'::jsonb;
ALTER TABLE web_user_access ADD CONSTRAINT web_user_access_modules_valid CHECK (
 jsonb_typeof(modules) = 'array' AND
 modules <@ '["crm","assistencia-tecnica","suprimentos","equipamentos","tarefas","programacao","tecnico"]'::jsonb
);
