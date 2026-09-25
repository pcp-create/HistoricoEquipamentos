ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS order_company integer;
ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS order_id bigint;
ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS order_number text;
CREATE INDEX IF NOT EXISTS web_tasks_order ON web_tasks(order_company,order_id) WHERE order_id IS NOT NULL;
