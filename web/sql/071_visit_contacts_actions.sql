CREATE TABLE web_customer_contacts(id uuid PRIMARY KEY,customer_key text NOT NULL,name text NOT NULL,phone text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(customer_key,name,phone));
ALTER TABLE web_sales_visits ADD COLUMN contact_id uuid REFERENCES web_customer_contacts(id);
ALTER TABLE web_sales_visits ADD COLUMN followers text[] NOT NULL DEFAULT '{}';
CREATE TABLE web_sales_visit_tasks(request_id uuid PRIMARY KEY,visit_id uuid NOT NULL REFERENCES web_sales_visits(id) ON DELETE CASCADE,task_id bigint NOT NULL REFERENCES web_tasks(id),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE web_sales_visit_alerts(id uuid PRIMARY KEY,visit_id uuid NOT NULL REFERENCES web_sales_visits(id) ON DELETE CASCADE,recipient text NOT NULL,scheduled_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','cancelled','skipped')),attempts integer NOT NULL DEFAULT 0,lease_token uuid,sent_at timestamptz,UNIQUE(visit_id,recipient,scheduled_at));
CREATE INDEX web_sales_visit_alert_due ON web_sales_visit_alerts(scheduled_at) WHERE state='pending' AND attempts=0;
ALTER TABLE web_customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sales_visit_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sales_visit_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_customer_contacts,web_sales_visit_tasks,web_sales_visit_alerts FROM PUBLIC,anon,authenticated;
-- Existing snapshots remain unchanged; seed reusable contacts without losing visit history.
INSERT INTO web_customer_contacts(id,customer_key,name,phone,created_by)
SELECT gen_random_uuid(),customer_key,contact,phone,min(seller) FROM web_sales_visits WHERE trim(contact)<>'' AND trim(phone)<>'' GROUP BY customer_key,contact,phone;
UPDATE web_sales_visits v SET contact_id=c.id FROM web_customer_contacts c WHERE c.customer_key=v.customer_key AND c.name=v.contact AND c.phone=v.phone;
