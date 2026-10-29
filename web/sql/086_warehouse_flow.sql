BEGIN;
CREATE TABLE IF NOT EXISTS web_warehouse_flow_changes(
 id uuid PRIMARY KEY,company_id int NOT NULL CHECK(company_id IN(1,2,27404)),order_id bigint NOT NULL,
 actor text NOT NULL,document jsonb NOT NULL,state text NOT NULL CHECK(state IN('sending','complete','rejected','uncertain')),
 message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouse_flow_order ON web_warehouse_flow_changes(company_id,order_id,created_at);
ALTER TABLE web_warehouse_flow_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_warehouse_flow_changes FROM PUBLIC,anon,authenticated;
COMMIT;
