ALTER TABLE web_customer_registry ADD COLUMN seller_user text REFERENCES web_user_access(email);
CREATE INDEX web_customer_registry_seller ON web_customer_registry(seller_user) WHERE seller_user IS NOT NULL;
