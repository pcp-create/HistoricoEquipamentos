# Criação de Ordens de Serviço no M8

Acesse **Assistência Técnica → Ordens de Serviço → + Nova Ordem de Serviço**. Os demais campos escalares opcionais da API ficam em **Outras informações**, recolhidos por padrão e validados no servidor. Campos principais não podem ser sobrescritos por essa seção.

O técnico é opcional e fica em **Outras informações**. Sem seleção, os campos de técnico são omitidos dos envios de cabeçalho, equipamento e serviços.

O formulário possui cabeçalho obrigatório e abas de Produtos e Serviços com o mesmo seletor de catálogo do orçamento. A empresa selecionada determina a autenticação e todas as gravações no ERP.

## Preparação

- Aplicar `web/sql/063_service_order_creation.sql`, após as migrações 060–062. A migração é idempotente e adiciona cadastros auxiliares, ID M8 do técnico e acompanhamento dos envios.
- Aplicar também `web/sql/064_service_order_flow_status.sql` para habilitar o cadastro de Status Fluxo.
- Em **Configurações → Cadastros**, atualizar Tipo Ordens de Serviço, Condições de Pagamento, Status Fluxo e Fretes. As listas ficam no banco e têm atualização manual; não dependem de novos jobs no integrador. O frete CIF usa o ID **0**, válido no M8.
- Cadastrar **Tipo Atendimento**, com ID M8 e ID/descrição do prazo de garantia, e **Origem Atendimento**, com ID M8. Estes cadastros locais não criam tipos no ERP.
- Em **Administração → Funcionários**, informar **ID do técnico no M8**. Usuários sem esse vínculo aparecem indisponíveis no seletor de técnico.
- Credenciais M8 permanecem no servidor, nas variáveis já utilizadas pela integração.

Clientes e equipamentos usam os cadastros compartilhados da empresa 1. A regra `buscarEquipamentoPorCliente` do tipo de OS controla o seletor e é validada novamente no servidor. O vendedor é consultado no cadastro do cliente, usando a empresa da nova OS: seleciona-se o padrão ou o único vendedor; em caso de ambiguidade o usuário escolhe entre os vendedores cadastrados.

## Contrato M8

Documentação: https://api.integra.m8sistemas.com.br/docs/index.html
OpenAPI utilizado: https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json

- Cabeçalho: `POST /v1/assistenciatecnica/ordemservico`.
- Equipamento selecionado: `POST /v1/assistenciatecnica/ordemservico/{id}/equipamento`, logo após o cabeçalho.
- Produtos: `POST /v1/assistenciatecnica/ordemservico/{id}/produto`.
- Serviços: `POST /v1/assistenciatecnica/ordemservico/{id}/servico`.
- Status Fluxo: cadastro via `GET /v1/faturamento/status`; seleção obrigatória, aplicada por `PATCH /v1/assistenciatecnica/ordemservico/{id}/statusfluxo` com `{"statusFluxoId": ID}`, após equipamento, produtos e serviços. O PATCH retorna confirmação sem ID.
- Vendedor: `funcionarioId`; técnico: `responsavelTecnicoId` e técnico do equipamento/serviço.
- Equipamento do catálogo: `equipamentoProdutoId` no corpo do POST de equipamento. O cabeçalho de novos envios não inclui `equipamentoProduto`, evitando cadastro duplicado. Envios preparados anteriormente preservam suas etapas originais.
- Garantia: `tipoGarantiaId`. A descrição é exibida a partir do cadastro local; não é enviada em `prazoCondicional`, que não está documentado como descrição da garantia.
- O schema marca `dataAbertura` e `horaAbertura` como **readOnly**. O formulário mostra o horário de Brasília e envia `emissao` com a data/hora da preparação. Os campos de abertura efetivos são definidos pelo ERP.
- Quantidades e valores são validados no servidor; `valorTotal` é calculado pelo sistema.

## Gravação e recuperação

Cada envio recebe um UUID persistido antes da primeira gravação externa. O cabeçalho e cada item são enviados uma única vez por etapa, com o ID da OS e o progresso guardados no banco. Chamadas concorrentes do mesmo envio não repetem a gravação. A lista **Meus envios recentes** permite acompanhar ou retomar itens que ainda não foram enviados.

Rejeição HTTP explícita do cabeçalho permite corrigir os dados e criar outra tentativa. Rejeição de um item preserva a OS e os itens já confirmados. Após corrigir a causa no ERP, o botão de continuar envia somente o item pendente e os seguintes. O conteúdo de um envio iniciado fica imutável.

Timeout, resposta sem ID, erro de servidor ou interrupção durante uma gravação deixam o envio aguardando conferência no ERP. Não há repetição automática de POST ou PATCH nem desbloqueio por tempo, pois o M8 não documenta chave de idempotência. Essa conferência é necessária para determinar se a gravação ocorreu antes de qualquer novo envio.

A nova OS entra na consulta local pelo integrador de novas ordens já existente. Após confirmar todas as etapas, a criação redireciona para /historico e abre a lateral da OS pela empresa e ID interno. Enquanto a OS concluída não estiver na base local, o detalhamento consulta o endpoint completo do M8 filtrado por ID na empresa correta. O cabeçalho usa o número sequencial retornado, sem confundi-lo com o ID interno.

Validação automatizada usa M8 simulado; não são criadas ordens reais durante testes.

Falha na atribuição do Status Fluxo preserva a OS e os itens confirmados. Rejeições explícitas permitem retomar apenas a etapa pendente; resultados ambíguos exigem conferência no ERP. Envios preparados antes desta mudança mantêm as etapas originais.

## Cadastros importados de CSV

Aplicar `web/sql/065_manual_service_order_registries.sql` após 064. Importa 33 tipos de atendimento (30 ativos), 11 origens e 9 situações. Registros excluídos ficam inativos; garantias já configuradas são preservadas. Os CSVs não incluem prazo de garantia: configurar ID e descrição no Tipo Atendimento antes de criar OS.

Situação Ordem de Serviço passa a ser manual. O único endpoint de situações documentado (`/v1/assistenciatecnica/ordemservico/situacao`) retornou SEPARADO/FALTANDO na conferência, em desacordo com a lista fornecida. O sistema usa os IDs e nomes do CSV e não oferece atualização M8 para esse cadastro.
