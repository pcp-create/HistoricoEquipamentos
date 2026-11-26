BEGIN;
ALTER TABLE crm_opportunities ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES web_sales_leads(id);
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS origin_lead_id uuid REFERENCES web_sales_leads(id);
ALTER TABLE crm_opportunities DROP CONSTRAINT IF EXISTS crm_opportunity_account_check;
ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunity_account_check CHECK ((customer_id IS NOT NULL) <> (lead_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS crm_opportunities_lead ON crm_opportunities(lead_id) WHERE lead_id IS NOT NULL;
COMMIT;
