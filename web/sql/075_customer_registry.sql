CREATE TABLE web_customer_registry (
 company_id integer NOT NULL,
 person_id bigint NOT NULL,
 assignee text REFERENCES web_user_access(email),
 version integer NOT NULL DEFAULT 1,
 detail jsonb NOT NULL DEFAULT '{}',
 sellers jsonb NOT NULL DEFAULT '[]',
 synced_at timestamptz,
 PRIMARY KEY(company_id,person_id)
);
ALTER TABLE web_customer_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_customer_registry FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_customer_registry FROM anon,authenticated; END IF; END $$;
