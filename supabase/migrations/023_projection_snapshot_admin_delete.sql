-- Keep captured values immutable. The admin-only API opts into deletion
-- for its transaction; unrelated writes and direct deletes remain blocked.
CREATE OR REPLACE FUNCTION public.reject_projection_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE'
    AND current_setting('app.projection_snapshot_admin_delete', true) = 'on' THEN
   RETURN OLD;
 END IF;
 RAISE EXCEPTION 'Parciais da projeção são imutáveis';
END $$;
