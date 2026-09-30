-- NULL retains the original single-operation withdrawal until its next change.
-- The aggregate withdrawn column remains the total used by planning and costs.
ALTER TABLE web_service_item_usage ADD COLUMN IF NOT EXISTS allocations jsonb;
