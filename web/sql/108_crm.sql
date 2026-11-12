BEGIN;
CREATE TABLE IF NOT EXISTS crm_opportunity_types (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, code text UNIQUE NOT NULL, name text NOT NULL,
 notes text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS crm_proposal_types (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,opportunity_type_id bigint NOT NULL REFERENCES crm_opportunity_types(id),
 code text UNIQUE NOT NULL,name text NOT NULL,notes text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS crm_proposal_order_types (
 proposal_type_id bigint NOT NULL REFERENCES crm_proposal_types(id),m8_order_type_id bigint NOT NULL CHECK(m8_order_type_id>0),
 PRIMARY KEY(proposal_type_id,m8_order_type_id)
);
CREATE TABLE IF NOT EXISTS crm_opportunities (
 id uuid PRIMARY KEY,number bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
 type_id bigint NOT NULL REFERENCES crm_opportunity_types(id),title text NOT NULL,customer_id bigint NOT NULL CHECK(customer_id>0),
 customer_name text NOT NULL,company_id integer NOT NULL CHECK(company_id IN(1,2,27404)),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','lost','cancelled')),notes text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,created_by text NOT NULL,updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm_proposals (
 id uuid PRIMARY KEY,number bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
 opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id),type_id bigint NOT NULL REFERENCES crm_proposal_types(id),
 title text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','converting','won','lost','cancelled')),
 document jsonb NOT NULL DEFAULT '{}',names jsonb NOT NULL DEFAULT '{}',total_cents bigint NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 1,created_by text NOT NULL,updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_proposals_opportunity ON crm_proposals(opportunity_id);
CREATE TABLE IF NOT EXISTS crm_order_links (
 id uuid PRIMARY KEY,proposal_id uuid NOT NULL REFERENCES crm_proposals(id),company_id integer NOT NULL CHECK(company_id IN(1,2,27404)),
 order_id bigint,submission_id uuid UNIQUE NOT NULL,document jsonb NOT NULL,actor text NOT NULL,
 state text NOT NULL DEFAULT 'preparing',message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_links_proposal ON crm_order_links(proposal_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_one_pending_conversion ON crm_order_links(proposal_id) WHERE state NOT IN('complete','validation_failed');
CREATE UNIQUE INDEX IF NOT EXISTS crm_link_order_unique ON crm_order_links(company_id,order_id) WHERE order_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS crm_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,opportunity_id uuid REFERENCES crm_opportunities(id),proposal_id uuid REFERENCES crm_proposals(id),
 action text NOT NULL,actor text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO crm_opportunity_types(code,name) VALUES('MAN','Manutenção') ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'MPA','Manutenção Preventiva Avulsa',' Tipos de OS previstos: MPA.' FROM crm_opportunity_types WHERE code='MAN' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,4 FROM crm_proposal_types WHERE code='MPA' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'MCA','Manutenção Corretiva Avulsa',' Tipos de OS previstos: MCA, ORC, OFI.' FROM crm_opportunity_types WHERE code='MAN' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,2 FROM crm_proposal_types WHERE code='MCA' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,43 FROM crm_proposal_types WHERE code='MCA' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,42 FROM crm_proposal_types WHERE code='MCA' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_opportunity_types(code,name) VALUES('PLN','Planos de Manutenção') ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'PMP','Plano de Manutenção Preventiva',' Tipos de OS previstos: MPC.' FROM crm_opportunity_types WHERE code='PLN' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,7 FROM crm_proposal_types WHERE code='PMP' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'PMT','Plano de Manutenção Total',' Tipos de OS previstos: MPC, MCC.' FROM crm_opportunity_types WHERE code='PLN' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,7 FROM crm_proposal_types WHERE code='PMT' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,5 FROM crm_proposal_types WHERE code='PMT' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'PGE','Plano de Garantia Estendida','GAR apenas quando a garantia for efetivamente do fabricante; validar cobertura. Tipos de OS previstos: MCC, GAR.' FROM crm_opportunity_types WHERE code='PLN' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,5 FROM crm_proposal_types WHERE code='PGE' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,19 FROM crm_proposal_types WHERE code='PGE' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'PI','Plano de Inspeção',' Tipos de OS previstos: INS.' FROM crm_opportunity_types WHERE code='PLN' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_opportunity_types(code,name) VALUES('CTR','Contratos') ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'CMT','Contrato de Manutenção',' Tipos de OS previstos: MPC, MCC.' FROM crm_opportunity_types WHERE code='CTR' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,7 FROM crm_proposal_types WHERE code='CMT' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,5 FROM crm_proposal_types WHERE code='CMT' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'CST','Contrato de Serviços Técnicos',' Tipos de OS previstos: STE.' FROM crm_opportunity_types WHERE code='CTR' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'CLO','Contrato de Locação',' Tipos de OS previstos: LOC.' FROM crm_opportunity_types WHERE code='CTR' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,29 FROM crm_proposal_types WHERE code='CLO' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_opportunity_types(code,name) VALUES('LOC','Locação') ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'LOC','Locação de Equipamentos',' Tipos de OS previstos: LOC.' FROM crm_opportunity_types WHERE code='LOC' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,29 FROM crm_proposal_types WHERE code='LOC' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_opportunity_types(code,name) VALUES('VEQ','Venda de Equipamentos') ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'VEQ','Venda de Equipamentos','PTT somente quando houver partida técnica. Venda sem execução pode não gerar OS. Tipos de OS previstos: PTT.' FROM crm_opportunity_types WHERE code='VEQ' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_order_types(proposal_type_id,m8_order_type_id) SELECT id,41 FROM crm_proposal_types WHERE code='VEQ' AND version=1 ON CONFLICT DO NOTHING;
INSERT INTO crm_opportunity_types(code,name) VALUES('VMP','Venda de Mercadorias e Peças') ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'VME','Venda de Mercadorias e Peças','EME opcional: entrega própria. Retirada pelo cliente e expedição simples podem ocorrer sem OS. Tipos de OS previstos: EME.' FROM crm_opportunity_types WHERE code='VMP' ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_opportunity_types(code,name) VALUES('SER','Serviços Técnicos') ON CONFLICT(code) DO NOTHING;
INSERT INTO crm_proposal_types(opportunity_type_id,code,name,notes) SELECT id,'ST','Serviços Técnicos Especializados','Tipos de atendimento para vibração, balanceamento, caça-vazamentos e outros estão propostos para cadastro. Tipos de OS previstos: STE.' FROM crm_opportunity_types WHERE code='SER' ON CONFLICT(code) DO NOTHING;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['crm_opportunity_types','crm_proposal_types','crm_proposal_order_types','crm_opportunities','crm_proposals','crm_order_links','crm_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',t); END IF;
 END LOOP;
END $$;
COMMIT;
