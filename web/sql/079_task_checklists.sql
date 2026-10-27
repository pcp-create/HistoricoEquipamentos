CREATE TABLE web_task_checklists (
 id uuid PRIMARY KEY,
 task_id bigint NOT NULL REFERENCES web_tasks(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_task_checklists_task ON web_task_checklists(task_id,created_at,id);
CREATE TABLE web_task_checklist_items (
 id uuid PRIMARY KEY,
 checklist_id uuid NOT NULL REFERENCES web_task_checklists(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 500),
 completed boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL,
 completed_by text,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(completed=(completed_at IS NOT NULL))
);
CREATE INDEX web_task_checklist_items_list ON web_task_checklist_items(checklist_id,created_at,id);
ALTER TABLE web_task_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_task_checklist_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_checklists,web_task_checklist_items FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_task_checklists,web_task_checklist_items FROM anon,authenticated; END IF; END $$;
