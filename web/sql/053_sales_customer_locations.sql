BEGIN;
CREATE TABLE IF NOT EXISTS web_sales_customer_locations (
 customer_key text PRIMARY KEY,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -85 AND 85),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL REFERENCES web_user_access(email)
);
ALTER TABLE web_sales_customer_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_sales_customer_locations FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_sales_customer_locations FROM anon,authenticated; END IF; END $$;
COMMIT;
