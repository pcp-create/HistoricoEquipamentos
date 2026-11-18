BEGIN;
CREATE TABLE IF NOT EXISTS web_calendar_appointments (
 id uuid PRIMARY KEY,
 owner text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('personal','leave','vacation','other')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL CHECK(ends_at>=starts_at),
 all_day boolean NOT NULL DEFAULT false,
 visibility text NOT NULL DEFAULT 'team' CHECK(visibility IN ('private','team')),
 description text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz
);
ALTER TABLE web_calendar_appointments ALTER COLUMN visibility SET DEFAULT 'team';
CREATE INDEX IF NOT EXISTS web_calendar_appointments_period ON web_calendar_appointments(owner,starts_at,ends_at) WHERE cancelled_at IS NULL;
ALTER TABLE web_calendar_appointments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_calendar_appointments FROM anon,authenticated;
COMMIT;
