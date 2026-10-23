-- External repairs may remain open while the parent machine is outside the workshop.
ALTER TABLE web_workshop_external ALTER COLUMN visit_id DROP NOT NULL;
ALTER TABLE web_workshop_external ADD COLUMN source jsonb NOT NULL DEFAULT '{}';
ALTER TABLE web_workshop_external ADD COLUMN status text NOT NULL DEFAULT 'repair' CHECK(status IN ('approval','quotation','repair','ready'));
ALTER TABLE web_workshop_external ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE web_workshop_external ADD COLUMN reconciled_out_at timestamptz;
