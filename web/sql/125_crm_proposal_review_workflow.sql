BEGIN;
ALTER TABLE crm_opportunities DROP CONSTRAINT IF EXISTS crm_opportunities_status_check;
ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_status_check CHECK(status IN ('open','lost','cancelled','won'));
UPDATE crm_opportunities o SET status='won',updated_at=now(),version=version+1
 WHERE o.status='open' AND EXISTS(SELECT 1 FROM crm_order_links l JOIN crm_proposals p ON p.id=l.proposal_id WHERE p.opportunity_id=o.id AND l.order_id IS NOT NULL);
CREATE TABLE IF NOT EXISTS crm_proposal_email_settings (id integer PRIMARY KEY CHECK(id=1),document jsonb NOT NULL DEFAULT '{}'::jsonb,updated_by text,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO crm_proposal_email_settings(id,document) SELECT 1,COALESCE(document->'customerEmail','{}'::jsonb) FROM web_service_schedule_settings WHERE id=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_email_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS crm_proposal_workflows (
 proposal_id uuid PRIMARY KEY REFERENCES crm_proposals(id),
 state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','in_review','reviewed','sent')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision >= 0),
 last_sent_revision integer CHECK(last_sent_revision >= 0 AND last_sent_revision <= revision),
 reviewer text REFERENCES web_user_access(email),
 review_requested_by text REFERENCES web_user_access(email),
 review_task_id bigint REFERENCES web_tasks(id),
 reviewed_by text REFERENCES web_user_access(email),
 reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm_proposal_sent_revisions (
 proposal_id uuid NOT NULL REFERENCES crm_proposals(id),
 revision integer NOT NULL CHECK(revision >= 0),
 proposal_version integer NOT NULL,
 document jsonb NOT NULL,
 names jsonb NOT NULL,
 title text NOT NULL,
 pdf bytea NOT NULL,
 sent_by text NOT NULL REFERENCES web_user_access(email),
 sent_at timestamptz NOT NULL DEFAULT now(),
 recipients text NOT NULL,
 gmail_message_id text NOT NULL,
 PRIMARY KEY(proposal_id,revision),
 UNIQUE(gmail_message_id)
);
CREATE TABLE IF NOT EXISTS crm_proposal_email_attempts (
 id uuid PRIMARY KEY,
 proposal_id uuid NOT NULL REFERENCES crm_proposals(id),
 revision integer NOT NULL CHECK(revision >= 0),
 proposal_version integer NOT NULL,
 actor text NOT NULL REFERENCES web_user_access(email),
 recipients text NOT NULL,
 document jsonb NOT NULL,
 names jsonb NOT NULL,
 title text NOT NULL,
 pdf bytea NOT NULL,
 state text NOT NULL CHECK(state IN ('sending','sent','failed','uncertain')),
 message_id text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_proposal_one_unresolved_email ON crm_proposal_email_attempts(proposal_id) WHERE state IN ('sending','uncertain');
ALTER TABLE crm_proposal_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_proposal_sent_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_proposal_email_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_proposal_email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_proposal_workflows,crm_proposal_sent_revisions,crm_proposal_email_attempts,crm_proposal_email_settings FROM PUBLIC,anon,authenticated;
COMMIT;
