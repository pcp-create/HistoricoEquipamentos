CREATE TABLE IF NOT EXISTS web_task_hierarchy (id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false);
INSERT INTO web_task_hierarchy(id,enabled) VALUES(1,false) ON CONFLICT(id) DO NOTHING;
ALTER TABLE web_task_hierarchy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_hierarchy FROM PUBLIC,anon,authenticated;
