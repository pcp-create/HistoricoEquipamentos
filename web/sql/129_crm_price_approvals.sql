BEGIN;
CREATE TABLE crm_price_approvals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 proposal_id uuid NOT NULL REFERENCES crm_proposals(id),
 fingerprint text NOT NULL,
 task_id bigint NOT NULL REFERENCES web_tasks(id),
 document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm_price_approvals(proposal_id,fingerprint);
CREATE TABLE crm_price_restorations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 submission_id uuid NOT NULL REFERENCES service_order_submissions(id),
 product_id bigint NOT NULL,
 item_index integer NOT NULL CHECK(item_index>=0),
 approval_id bigint NOT NULL REFERENCES crm_price_approvals(id),
 company_id integer NOT NULL,
 original_price numeric NOT NULL CHECK(original_price>=0),
 temporary_price numeric NOT NULL CHECK(temporary_price>=0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','restored','conflict')),
 item_result jsonb,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 restored_at timestamptz
);
CREATE UNIQUE INDEX ON crm_price_restorations(product_id) WHERE state<>'restored';
ALTER TABLE crm_price_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_price_restorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_price_approvals,crm_price_restorations FROM PUBLIC,anon,authenticated;
COMMIT;
