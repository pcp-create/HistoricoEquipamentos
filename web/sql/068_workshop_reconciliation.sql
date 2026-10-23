-- Preserve confirmed physical entries even when the ERP identity is still unknown.
ALTER TABLE web_workshop_visits ALTER COLUMN equipment_id DROP NOT NULL;
ALTER TABLE web_workshop_visits ALTER COLUMN workshop_id DROP NOT NULL;
ALTER TABLE web_workshop_visits ADD COLUMN reconciled_out_at timestamptz;
ALTER TABLE web_workshop_visits ADD COLUMN reconciliation_reason text;
DROP INDEX web_workshop_open_equipment;
CREATE UNIQUE INDEX web_workshop_open_equipment ON web_workshop_visits(equipment_id) WHERE exited_at IS NULL AND reconciled_out_at IS NULL;
ALTER TABLE web_workshop_visits DROP CONSTRAINT web_workshop_visits_stage_check;
ALTER TABLE web_workshop_visits ADD CONSTRAINT web_workshop_visits_stage_check CHECK(stage IN ('received','diagnosis','approval','parts','repair','ready','quotation','factory_warranty','rj_warranty','return_unrepaired'));
