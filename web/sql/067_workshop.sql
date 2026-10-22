CREATE TABLE web_workshops(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),active boolean NOT NULL DEFAULT true);
INSERT INTO web_workshops(name) VALUES('RJ Compressores'),('RJ Serrana'),('Criciúma');
CREATE TABLE web_workshop_visits(
 id uuid PRIMARY KEY,equipment_id bigint NOT NULL,workshop_id bigint NOT NULL REFERENCES web_workshops(id),
 entered_at timestamptz NOT NULL,expected_at date,exited_at timestamptz,
 stage text NOT NULL DEFAULT 'received' CHECK(stage IN ('received','diagnosis','approval','parts','repair','ready')),
 source jsonb NOT NULL DEFAULT '{}',notes text NOT NULL DEFAULT '',exit_notes text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(exited_at IS NULL OR exited_at>=entered_at)
);
CREATE UNIQUE INDEX web_workshop_open_equipment ON web_workshop_visits(equipment_id) WHERE exited_at IS NULL;
CREATE TABLE web_workshop_external(
 id uuid PRIMARY KEY,visit_id uuid NOT NULL REFERENCES web_workshop_visits(id),component text NOT NULL,supplier text NOT NULL,
 sent_at timestamptz NOT NULL,expected_at date,returned_at timestamptz,notes text NOT NULL DEFAULT '',created_by text NOT NULL,
 CHECK(returned_at IS NULL OR returned_at>=sent_at)
);
CREATE TABLE web_workshop_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,visit_id uuid NOT NULL REFERENCES web_workshop_visits(id),action text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),document jsonb NOT NULL DEFAULT '{}');
CREATE TABLE web_workshop_quotes(visit_id uuid NOT NULL REFERENCES web_workshop_visits(id),company_id integer NOT NULL,quote_id bigint NOT NULL,PRIMARY KEY(visit_id,company_id,quote_id));
ALTER TABLE web_workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_workshop_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_workshop_external ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_workshop_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_workshop_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_workshops,web_workshop_visits,web_workshop_external,web_workshop_events,web_workshop_quotes FROM PUBLIC,anon,authenticated;

CREATE TABLE web_workshop_imports(id text PRIMARY KEY,filename text NOT NULL,sheet text NOT NULL,row_number integer NOT NULL,document jsonb NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','imported')),reason text,visit_id uuid REFERENCES web_workshop_visits(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE web_workshop_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_workshop_imports FROM PUBLIC,anon,authenticated;
