CREATE TABLE IF NOT EXISTS web_order_links (
 company_id integer NOT NULL, order_id bigint NOT NULL,
 linked_company_id integer, linked_order_id bigint,
 version integer NOT NULL DEFAULT 1, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,order_id),
 CHECK ((linked_company_id IS NULL) = (linked_order_id IS NULL)),
 CHECK (linked_company_id IS NULL OR linked_company_id<>company_id OR linked_order_id<>order_id)
);
ALTER TABLE web_order_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_order_links FROM PUBLIC,anon,authenticated;
