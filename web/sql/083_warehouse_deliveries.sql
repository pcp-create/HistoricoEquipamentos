BEGIN;
CREATE TABLE IF NOT EXISTS web_warehouse_batches(
 id uuid PRIMARY KEY,actor text NOT NULL,technician text NOT NULL,
 document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_warehouse_delivery_items(
 batch_id uuid NOT NULL REFERENCES web_warehouse_batches(id),
 company_id integer NOT NULL CHECK(company_id IN(1,2,27404)),
 order_id bigint NOT NULL,item_id bigint NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0),
 PRIMARY KEY(batch_id,company_id,order_id,item_id)
);
CREATE INDEX IF NOT EXISTS warehouse_delivery_order ON web_warehouse_delivery_items(company_id,order_id,item_id);
ALTER TABLE web_warehouse_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_warehouse_delivery_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_warehouse_batches,web_warehouse_delivery_items FROM PUBLIC,anon,authenticated;
COMMIT;
