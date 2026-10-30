-- Separate ledger survives administrator deletion of the snapshot itself.
CREATE TABLE IF NOT EXISTS web_projection_daily_snapshots (
 day date PRIMARY KEY,
 snapshot_id uuid UNIQUE REFERENCES web_sales_projection_snapshots(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_projection_daily_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_projection_daily_snapshots FROM PUBLIC,anon,authenticated;
