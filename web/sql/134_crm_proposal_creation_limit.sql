BEGIN;
ALTER TABLE crm_proposal_types ADD COLUMN IF NOT EXISTS creation_limit_minutes integer CHECK(creation_limit_minutes BETWEEN 1 AND 5256000);
-- Preserve the currently configured creation deadline when moving it to each type.
UPDATE crm_proposal_types SET creation_limit_minutes=(SELECT (limits->>'proposal:creating')::integer FROM crm_stage_limit_settings WHERE id=1)
 WHERE creation_limit_minutes IS NULL;
UPDATE crm_stage_limit_settings SET limits=limits-'proposal:creating',version=version+1,updated_at=now() WHERE limits ? 'proposal:creating';
COMMIT;
