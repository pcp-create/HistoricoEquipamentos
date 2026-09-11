-- PostgreSQL 15+ / Supabase. Executar com db:migrate ou SQL Editor.
-- Chaves incluem empresa consultada (company_id), sem supor unicidade global.

CREATE TABLE public.m8_ordens_servico (
  company_id integer NOT NULL CHECK (company_id > 0),
  id_m8 bigint NOT NULL,
  cliente_id bigint,
  cliente_nome text,
  cliente_razao_social text,
  cliente_cpf_cnpj text,
  data_abertura timestamptz,
  data_entrega_prevista timestamptz,
  data_entrega timestamptz,
  emissao timestamptz,
  data_lancamento timestamptz,
  data_faturamento timestamptz,
  data_atualizacao timestamptz,
  data_garantia timestamptz,
  tipo_id bigint,
  tipo_nome text,
  contato text,
  funcionario_id bigint,
  funcionario_nome text,
  revenda_contrato_id bigint,
  revenda_contrato_nome text,
  endereco_entrega_id bigint,
  endereco_entrega_nome text,
  condicao_pagamento_id bigint,
  condicao_pagamento_nome text,
  responsavel_tecnico_id bigint,
  responsavel_tecnico_nome text,
  numero_sequencia bigint,
  situacao_id bigint,
  situacao_nome text,
  status_lancamento_id bigint,
  status_lancamento_nome text,
  status text,
  status_aprovacao text,
  tipo_atendimento_id bigint,
  tipo_atendimento_nome text,
  modalidade_atendimento_id bigint,
  modalidade_atendimento_nome text,
  defeitos_apontados text,
  modelo_veiculo text,
  placa_veiculo text,
  serie text,
  numero_serie text,
  equipamento text,
  produto_equipamento_id bigint,
  modelo_equipamento text,
  documento_equipamento text,
  tipo_documento_fiscal bigint,
  documento_fiscal_id bigint,
  documento_compra_id bigint,
  documento_compra_doc bigint,
  imposto text,
  origem_dados text,
  projeto_id bigint,
  projeto_nome text,
  empresa_id bigint,
  empresa_nome text,
  empresa_grupo_nome text,
  total_geral numeric,
  ativo boolean,
  atualizado_pelo_usuario_id bigint,
  observacao text,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id_m8)
);

CREATE TABLE public.m8_os_produtos (
  company_id integer NOT NULL CHECK (company_id > 0),
  id_m8 bigint NOT NULL,
  ordem_servico_id bigint NOT NULL,
  produto_id bigint,
  produto_nome text,
  tipo_contrato text,
  referencia_fabricante text,
  multiplo_venda numeric,
  codigo_similaridade text,
  descricao_detalhada_nfe text,
  destino_estoque_id bigint,
  destino_estoque_nome text,
  unidade_id bigint,
  unidade_nome text,
  valor_total numeric,
  situacao_item_id bigint,
  situacao_item_nome text,
  quantidade numeric,
  valor_unitario numeric,
  peso_liquido numeric,
  volume_nome text,
  observacao_interna text,
  observacao text,
  saldo numeric,
  faturado boolean,
  operacao_fiscal_id bigint,
  tributacao_operacao_fiscal_id bigint,
  cst text,
  quantidade_conversao numeric,
  valor_unitario_conversao numeric,
  valor_unitario_desconto numeric,
  percentual_desconto numeric,
  valor_desconto numeric,
  valor_desconto_rateio numeric,
  fator_conversao numeric,
  valor_total_conversao numeric,
  unidade_conversao_id bigint,
  unidade_conversao_nome text,
  base_calculo_icms_diferencial numeric,
  aliquota_icms numeric,
  aliquota_icms_st numeric,
  percentual_reducao_icms numeric,
  aliquota_mva numeric,
  aliquota_pis numeric,
  aliquota_cofins numeric,
  aliquota_ipi numeric,
  aliquota_funrural numeric,
  aliquota_icms_diferencial numeric,
  valor_icms numeric,
  valor_icms_st numeric,
  valor_pis numeric,
  valor_cofins numeric,
  valor_ipi numeric,
  valor_icms_diferencial numeric,
  aprovado boolean,
  codigo_pedido text,
  numero_item_pedido bigint,
  prazo_entrega text,
  percentual_comissao_tabela_preco numeric,
  data_atualizacao timestamptz,
  esta_excluido boolean,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, ordem_servico_id, id_m8),
  FOREIGN KEY (company_id, ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id, id_m8)
);

CREATE TABLE public.m8_os_servicos (
  company_id integer NOT NULL CHECK (company_id > 0),
  id_m8 bigint NOT NULL,
  ordem_servico_id bigint NOT NULL,
  servico_id bigint,
  servico_nome text,
  quantidade numeric,
  valor_unitario numeric,
  valor_total numeric,
  data_atualizacao timestamptz,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, ordem_servico_id, id_m8),
  FOREIGN KEY (company_id, ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id, id_m8)
);

CREATE TABLE public.m8_os_apontamentos (
  company_id integer NOT NULL CHECK (company_id > 0),
  id_m8 bigint NOT NULL,
  ordem_servico_id bigint NOT NULL,
  servico_id bigint,
  servico_nome text,
  funcionario_id bigint,
  funcionario_nome text,
  etapa_id bigint,
  etapa_nome text,
  hora_inicio text,
  hora_fim text,
  total_horas text,
  descricao_servico text,
  data timestamptz,
  data_atualizacao timestamptz,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, ordem_servico_id, id_m8),
  FOREIGN KEY (company_id, ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id, id_m8)
);

CREATE TABLE public.m8_equipamentos (
  company_id integer NOT NULL CHECK (company_id > 0),
  id_m8 bigint NOT NULL,
  ordem_servico_id bigint NOT NULL,
  equipamento_id bigint,
  equipamento_produto_id bigint,
  numero_serie text,
  horimetro numeric,
  horimetro_dois numeric,
  horimetro_tres numeric,
  box text,
  data_instalacao timestamptz,
  dias_garantia bigint,
  marca_id bigint,
  marca text,
  equipamento_modelo text,
  documento_origem text,
  defeitos text,
  problema text,
  solucao text,
  pendencia text,
  observacoes text,
  observacoes_internas text,
  data_atualizacao timestamptz,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, ordem_servico_id, id_m8),
  FOREIGN KEY (company_id, ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id, id_m8)
);

CREATE TABLE public.m8_checklist_respostas (
  company_id integer NOT NULL CHECK (company_id > 0),
  id_m8 bigint NOT NULL,
  ordem_servico_id bigint NOT NULL,
  checklist_pergunta_execucao_relacionada_id bigint,
  metodo text,
  pergunta text,
  avaliacao_nota numeric,
  observacao text,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, ordem_servico_id, id_m8),
  FOREIGN KEY (company_id, ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id, id_m8)
);

CREATE TABLE public.m8_anexos (
  company_id integer NOT NULL CHECK (company_id > 0),
  id_m8 bigint NOT NULL,
  ordem_servico_id bigint NOT NULL,
  descricao text,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, ordem_servico_id, id_m8),
  FOREIGN KEY (company_id, ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id, id_m8)
);

-- Estrutura interna de manutenção não fornecida. Preserva objeto sem inventar campos.
CREATE TABLE public.m8_os_manutencao (
  company_id integer NOT NULL,
  ordem_servico_id bigint NOT NULL,
  payload jsonb NOT NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, ordem_servico_id),
  FOREIGN KEY (company_id, ordem_servico_id) REFERENCES public.m8_ordens_servico(company_id, id_m8)
);
CREATE TABLE public.integracao_m8_checkpoint (
  company_id integer PRIMARY KEY,
  ultima_sincronizacao timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.integracao_m8_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id integer NOT NULL,
  processo text NOT NULL DEFAULT 'ORDENS_SERVICO',
  tipo_execucao text NOT NULL CHECK (tipo_execucao IN ('INICIAL','INCREMENTAL','REPROCESSAMENTO','TESTE')),
  data_inicio timestamptz NOT NULL DEFAULT now(),
  data_fim timestamptz,
  periodo_inicial timestamptz NOT NULL,
  periodo_final timestamptz NOT NULL,
  pagina_atual integer NOT NULL DEFAULT 0,
  paginas_processadas integer NOT NULL DEFAULT 0,
  registros_recebidos bigint NOT NULL DEFAULT 0,
  registros_inseridos bigint NOT NULL DEFAULT 0,
  registros_atualizados bigint NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('EXECUTANDO','CONCLUIDO','ERRO','LIMITADO')),
  erro text,
  duracao_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integracao_m8_log_empresa_inicio ON public.integracao_m8_log(company_id, data_inicio DESC);
CREATE INDEX m8_os_numero ON public.m8_ordens_servico(company_id, numero_sequencia);
CREATE INDEX m8_os_serie ON public.m8_ordens_servico(numero_serie);
CREATE INDEX m8_os_cliente ON public.m8_ordens_servico(cliente_id);
CREATE INDEX m8_os_documento ON public.m8_ordens_servico(cliente_cpf_cnpj);
CREATE INDEX m8_os_equipamento ON public.m8_ordens_servico(produto_equipamento_id);
CREATE INDEX m8_os_atualizacao ON public.m8_ordens_servico(company_id, data_atualizacao);
CREATE INDEX m8_os_emissao ON public.m8_ordens_servico(company_id, emissao);
CREATE INDEX m8_produtos_produto ON public.m8_os_produtos(produto_id);
CREATE INDEX m8_produtos_referencia ON public.m8_os_produtos(referencia_fabricante);
CREATE INDEX m8_produtos_similaridade ON public.m8_os_produtos(codigo_similaridade);
CREATE INDEX m8_produtos_atualizacao ON public.m8_os_produtos(data_atualizacao);
CREATE INDEX m8_equipamentos_serie ON public.m8_equipamentos(numero_serie);
CREATE INDEX m8_equipamentos_modelo ON public.m8_equipamentos(equipamento_modelo);
-- As PKs dos filhos já indexam (company_id, ordem_servico_id).

CREATE VIEW public.vw_os_materiais WITH (security_invoker = true) AS
SELECT o.company_id, o.id_m8 AS ordem_servico_id, o.numero_sequencia AS numero_os,
  o.cliente_id, o.cliente_nome, o.cliente_cpf_cnpj,
  o.equipamento, o.modelo_equipamento, o.numero_serie,
  o.emissao AS data_os, o.data_atualizacao, o.situacao_nome, o.status,
  p.id_m8 AS item_id, p.produto_id, p.produto_nome, p.referencia_fabricante,
  p.codigo_similaridade, p.quantidade, p.valor_unitario, p.valor_total
FROM public.m8_ordens_servico o
JOIN public.m8_os_produtos p ON p.company_id = o.company_id AND p.ordem_servico_id = o.id_m8
WHERE p.esta_excluido IS NOT TRUE;

-- Não junta equipamentoProduto: pode haver várias observações por OS, multiplicando materiais.
CREATE VIEW public.vw_historico_equipamentos WITH (security_invoker = true) AS
SELECT o.company_id, o.id_m8 AS ordem_servico_id, o.numero_sequencia AS numero_os,
  o.cliente_nome, o.cliente_cpf_cnpj, o.equipamento, o.modelo_equipamento, o.numero_serie,
  o.emissao AS data_os, o.situacao_nome, o.status,
  p.id_m8 AS item_id, p.produto_id, p.produto_nome, p.quantidade,
  p.referencia_fabricante, p.valor_unitario, p.valor_total
FROM public.m8_ordens_servico o
LEFT JOIN public.m8_os_produtos p ON p.company_id = o.company_id AND p.ordem_servico_id = o.id_m8
  AND p.esta_excluido IS NOT TRUE;
CREATE VIEW public.vw_historico_materiais WITH (security_invoker = true) AS
SELECT company_id, produto_id, produto_nome, referencia_fabricante, codigo_similaridade,
  item_id, ordem_servico_id, numero_os, cliente_nome, cliente_cpf_cnpj,
  equipamento, modelo_equipamento, numero_serie, quantidade, data_os, valor_unitario, valor_total
FROM public.vw_os_materiais;

-- Fail-closed: nenhuma policy pública. Permissões futuras deverão ser por usuário/empresa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['m8_ordens_servico','m8_os_produtos','m8_os_servicos',
    'm8_os_apontamentos','m8_equipamentos','m8_checklist_respostas','m8_anexos',
    'm8_os_manutencao','integracao_m8_checkpoint','integracao_m8_log']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
  REVOKE ALL ON public.vw_os_materiais, public.vw_historico_equipamentos, public.vw_historico_materiais FROM PUBLIC;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.vw_os_materiais, public.vw_historico_equipamentos, public.vw_historico_materiais FROM anon, authenticated;
  END IF;
END $$;
