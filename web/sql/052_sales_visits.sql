BEGIN;
ALTER TABLE web_task_territories ADD COLUMN IF NOT EXISTS seller_user text REFERENCES web_user_access(email);
CREATE INDEX IF NOT EXISTS web_task_territories_seller ON web_task_territories(seller_user);
CREATE TABLE IF NOT EXISTS web_sales_leads (
 id uuid PRIMARY KEY, owner text NOT NULL REFERENCES web_user_access(email), name text NOT NULL,
 city text NOT NULL, uf text NOT NULL, address text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_sales_visits (
 id uuid PRIMARY KEY, seller text NOT NULL REFERENCES web_user_access(email), customer_key text NOT NULL,
 scheduled_at timestamptz NOT NULL, contact text NOT NULL, phone text NOT NULL, description text NOT NULL DEFAULT '',
 completed_at timestamptz, outcome text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='completed')=(completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS web_sales_visits_seller ON web_sales_visits(seller,scheduled_at);
CREATE INDEX IF NOT EXISTS web_sales_visits_customer ON web_sales_visits(customer_key,completed_at);
ALTER TABLE web_sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sales_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_sales_leads,web_sales_visits FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_sales_leads,web_sales_visits FROM anon,authenticated; END IF; END $$;
COMMIT;
