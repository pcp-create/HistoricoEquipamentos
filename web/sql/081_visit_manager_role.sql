ALTER TABLE public.web_user_access DROP CONSTRAINT web_user_access_role_check;
ALTER TABLE public.web_user_access ADD CONSTRAINT web_user_access_role_check CHECK (role IN ('admin','manager','user'));
