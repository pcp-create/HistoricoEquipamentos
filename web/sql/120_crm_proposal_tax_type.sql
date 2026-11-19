-- Configure fiscal simulation once per proposal type. Existing types require explicit mapping.
ALTER TABLE crm_proposal_types ADD COLUMN IF NOT EXISTS tax_budget_type bigint CHECK (tax_budget_type > 0);
ALTER TABLE crm_proposal_types ADD COLUMN IF NOT EXISTS tax_budget_name text NOT NULL DEFAULT '';
