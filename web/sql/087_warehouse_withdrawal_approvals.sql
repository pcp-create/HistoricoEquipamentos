BEGIN;
CREATE TABLE IF NOT EXISTS web_warehouse_withdrawal_confirmations(
 batch_id uuid PRIMARY KEY REFERENCES web_warehouse_batches(id),
 task_id bigint NOT NULL UNIQUE REFERENCES web_tasks(id),
 employee text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_warehouse_withdrawal_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_warehouse_withdrawal_confirmations FROM PUBLIC,anon,authenticated;
COMMIT;
