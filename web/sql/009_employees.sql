-- Cadastro unificado de funcionários, acesso e destinatários. Opt-in explícito.
ALTER TABLE web_user_access
 ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS alert_preventive boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS alert_rental boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS alert_email boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS alert_whatsapp boolean NOT NULL DEFAULT false;
