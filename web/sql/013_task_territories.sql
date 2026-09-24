CREATE TABLE IF NOT EXISTS web_task_territories (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 city text NOT NULL, city_key text NOT NULL, uf text NOT NULL CHECK(uf ~ '^[A-Z]{2}$'),
 assignee text NOT NULL REFERENCES web_user_access(email), version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL,
 UNIQUE(city_key,uf)
);
ALTER TABLE web_task_territories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_territories FROM PUBLIC,anon,authenticated;
