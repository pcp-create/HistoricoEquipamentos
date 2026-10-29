BEGIN;
ALTER TABLE web_warehouse_batches ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'delivery' CHECK(kind IN('delivery','receipt'));
CREATE TABLE IF NOT EXISTS web_warehouse_material_additions(
 id uuid PRIMARY KEY,company_id integer NOT NULL CHECK(company_id IN(1,2,27404)),order_id bigint NOT NULL,
 actor text NOT NULL,document jsonb NOT NULL,state text NOT NULL CHECK(state IN('sending','complete','rejected','uncertain')),
 item_id bigint,message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouse_material_additions_order ON web_warehouse_material_additions(company_id,order_id,created_at);
ALTER TABLE web_warehouse_material_additions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_warehouse_material_additions FROM PUBLIC,anon,authenticated;
COMMIT;
