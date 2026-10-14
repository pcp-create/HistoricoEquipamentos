CREATE TABLE IF NOT EXISTS web_field_locations (
 actor text PRIMARY KEY REFERENCES web_user_access(email) ON DELETE CASCADE,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy double precision NOT NULL CHECK(accuracy>=0),
 located_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_field_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_field_locations FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS web_field_events_actor_location ON web_field_events(actor,located_at DESC);
