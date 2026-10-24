CREATE TABLE web_sales_disqualifications (
 customer_key text PRIMARY KEY,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 actor text NOT NULL REFERENCES web_user_access(email),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_sales_disqualifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_sales_disqualifications FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_sales_disqualifications FROM anon,authenticated; END IF; END $$;
