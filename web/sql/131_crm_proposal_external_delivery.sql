BEGIN;
ALTER TABLE crm_proposal_sent_revisions ALTER COLUMN gmail_message_id DROP NOT NULL;
ALTER TABLE crm_proposal_sent_revisions ADD COLUMN delivery_channel text NOT NULL DEFAULT 'email' CHECK(delivery_channel IN ('email','whatsapp','manual'));
CREATE TABLE crm_proposal_external_deliveries (
 id uuid PRIMARY KEY,
 proposal_id uuid NOT NULL REFERENCES crm_proposals(id),
 proposal_version integer NOT NULL,
 revision integer NOT NULL,
 channel text NOT NULL CHECK(channel IN ('whatsapp','manual')),
 document jsonb NOT NULL,
 names jsonb NOT NULL,
 title text NOT NULL,
 pdf bytea NOT NULL,
 created_by text NOT NULL REFERENCES web_user_access(email),
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz
);
ALTER TABLE crm_proposal_external_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_proposal_external_deliveries FROM PUBLIC,anon,authenticated;
COMMIT;
