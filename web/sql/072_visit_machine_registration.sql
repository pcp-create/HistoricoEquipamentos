BEGIN READ WRITE;
CREATE TABLE IF NOT EXISTS web_visit_automation_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 equipment_assignee text REFERENCES web_user_access(email),
 updated_by text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO web_visit_automation_settings(id,equipment_assignee)
SELECT true,email FROM web_user_access WHERE email='vendas1@rjserranacompressores.com.br' AND enabled
ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS web_visit_machine_registrations (
 id uuid PRIMARY KEY,
 customer_key text NOT NULL,
 equipment_type text NOT NULL,
 model text NOT NULL,
 brand text NOT NULL,
 serial text NOT NULL,
 meter numeric NOT NULL CHECK(meter>=0),
 task_id bigint REFERENCES web_tasks(id),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_visit_machine_customer_idx ON web_visit_machine_registrations(customer_key);
ALTER TABLE web_visit_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_visit_machine_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_visit_automation_settings,web_visit_machine_registrations FROM PUBLIC,anon,authenticated;
COMMIT;
