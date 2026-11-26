BEGIN;
ALTER TABLE crm_proposal_types ADD COLUMN IF NOT EXISTS equipment_required boolean NOT NULL DEFAULT true;
COMMIT;
