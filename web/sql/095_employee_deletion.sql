-- Keep employee history and deny access even for allowlisted email addresses.
ALTER TABLE public.web_user_access ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.web_user_access'::regclass AND conname='web_deleted_employee_disabled') THEN
  ALTER TABLE public.web_user_access ADD CONSTRAINT web_deleted_employee_disabled CHECK (deleted_at IS NULL OR NOT enabled);
 END IF;
END $$;
