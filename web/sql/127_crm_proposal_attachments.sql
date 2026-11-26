BEGIN;
CREATE TABLE IF NOT EXISTS crm_proposal_attachments (
 id uuid PRIMARY KEY,
 proposal_id uuid NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
 filename text NOT NULL,
 content bytea NOT NULL,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_proposal_attachments_proposal ON crm_proposal_attachments(proposal_id,created_at DESC);
ALTER TABLE crm_proposal_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_proposal_attachments FROM PUBLIC,anon,authenticated;
COMMIT;
