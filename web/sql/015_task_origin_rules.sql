CREATE TABLE IF NOT EXISTS web_task_origin_rules (
 origin text PRIMARY KEY,
 assignee text REFERENCES web_user_access(email),
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL DEFAULT 'Sistema'
);
INSERT INTO web_task_origin_rules(origin) VALUES
 ('Máquina de Locação'),('Máquina Emprestada'),
 ('Preventiva de Equipamento Locado'),('Preventiva de Equipamento Emprestado'),
 ('Preventiva de Equipamento Próprio') ON CONFLICT DO NOTHING;
UPDATE web_task_origin_rules SET assignee=u.email FROM web_user_access u
 WHERE u.email='atendimento@rjserranacompressores.com.br' AND u.enabled
 AND origin IN ('Máquina de Locação','Máquina Emprestada') AND version=1 AND assignee IS NULL;
ALTER TABLE web_task_origin_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_origin_rules FROM PUBLIC,anon,authenticated;
