CREATE TABLE web_inspection_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 created_by text NOT NULL DEFAULT 'Sistema',created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO web_inspection_types(code,name) VALUES('vibration','Coleta e análise de vibração'),('leakage','Detecção de vazamentos de ar comprimido');
CREATE TABLE web_inspection_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_person_id bigint NOT NULL,customer_company_id integer NOT NULL DEFAULT 1,
 type_id uuid NOT NULL REFERENCES web_inspection_types(id),route_name text NOT NULL DEFAULT '',
 interval_value integer NOT NULL CHECK(interval_value BETWEEN 1 AND 3650),
 interval_unit text NOT NULL CHECK(interval_unit IN('days','months')),
 notice_days integer NOT NULL DEFAULT 30 CHECK(notice_days BETWEEN 0 AND 365),
 baseline_date date,first_due date,notes text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,created_by text NOT NULL,updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_person_id,type_id)
);
CREATE TABLE web_inspection_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_id uuid NOT NULL REFERENCES web_inspection_plans(id),
 collected_on date NOT NULL,report_id uuid REFERENCES web_vibration_reports(id),
 service_order text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(plan_id,report_id)
);
CREATE INDEX web_inspection_records_plan ON web_inspection_records(plan_id,collected_on DESC);
CREATE TABLE web_inspection_quotes (
 request_id uuid PRIMARY KEY,plan_id uuid NOT NULL REFERENCES web_inspection_plans(id),
 quote_id uuid NOT NULL REFERENCES web_quotes(id),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_inspection_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_inspection_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_inspection_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_inspection_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_inspection_types,web_inspection_plans,web_inspection_records,web_inspection_quotes FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_inspection_types,web_inspection_plans,web_inspection_records,web_inspection_quotes FROM anon,authenticated; END IF; END $$;
