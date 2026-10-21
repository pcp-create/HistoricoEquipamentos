BEGIN;
CREATE TABLE IF NOT EXISTS web_sales_visit_purposes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 120),
 description text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1
);
ALTER TABLE web_sales_visits ADD COLUMN IF NOT EXISTS purpose_id bigint REFERENCES web_sales_visit_purposes(id);
ALTER TABLE web_sales_visit_purposes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_sales_visit_purposes FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_sales_visit_purposes FROM anon,authenticated; END IF; END $$;
INSERT INTO web_sales_visit_purposes(name,description) VALUES
('Prospecção','Visita para identificar novos clientes ou oportunidades.'),
('Apresentação Comercial','Apresentação de produtos, serviços ou soluções.'),
('Negociação','Discussão de propostas, preços e condições comerciais.'),
('Fechamento de Venda','Visita destinada à conclusão de uma negociação.'),
('Pós-venda','Acompanhamento do cliente após a venda.'),
('Visita Técnica','Avaliação de equipamentos ou necessidades técnicas.'),
('Relacionamento','Manutenção e fortalecimento do relacionamento com o cliente.'),
('Levantamento de Necessidades','Identificação de demandas e oportunidades de melhoria.'),
('Cobrança','Tratativas relacionadas a pendências financeiras.'),
('Outros','Finalidades não contempladas nas opções anteriores.')
ON CONFLICT(name) DO NOTHING;
COMMIT;
