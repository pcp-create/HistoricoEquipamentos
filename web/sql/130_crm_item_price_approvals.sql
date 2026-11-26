BEGIN;
CREATE TABLE crm_item_price_approvals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 proposal_id uuid NOT NULL REFERENCES crm_proposals(id),
 item_key text NOT NULL,
 product_id bigint NOT NULL,
 minimum_price numeric NOT NULL CHECK(minimum_price>=0),
 document jsonb NOT NULL,
 approved_by text NOT NULL REFERENCES web_user_access(email),
 approved_name text NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(proposal_id,item_key)
);
ALTER TABLE crm_item_price_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_item_price_approvals FROM PUBLIC,anon,authenticated;
ALTER TABLE crm_price_restorations ALTER COLUMN approval_id DROP NOT NULL;
ALTER TABLE crm_price_restorations ADD COLUMN item_approval_id bigint REFERENCES crm_item_price_approvals(id);
COMMIT;
