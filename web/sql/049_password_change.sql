ALTER TABLE web_user_access ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
UPDATE web_user_access SET must_change_password = (last_login_at IS NULL);
