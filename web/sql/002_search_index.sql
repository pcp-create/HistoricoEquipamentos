CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
CREATE INDEX IF NOT EXISTS web_history_search_document ON public.web_history_search USING gin(document gin_trgm_ops);
