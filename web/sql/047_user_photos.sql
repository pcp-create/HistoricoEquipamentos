CREATE TABLE IF NOT EXISTS web_user_photos (
 email text PRIMARY KEY REFERENCES web_user_access(email) ON DELETE CASCADE,
 image bytea NOT NULL CHECK(octet_length(image)<=300000),
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL
);
ALTER TABLE web_user_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_user_photos FROM PUBLIC,anon,authenticated;
