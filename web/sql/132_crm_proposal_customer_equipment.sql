BEGIN;
ALTER TABLE crm_proposal_types ADD COLUMN IF NOT EXISTS customer_equipment_only boolean NOT NULL DEFAULT true;
COMMIT;
