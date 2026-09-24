# Divisão comercial de tarefas

Em **Administração → Divisão comercial**, administradores podem cadastrar,
pesquisar, editar e remover a relação Cidade + UF → Orçamentista. A lista de
responsáveis usa os funcionários ativos. Uma cidade não pode ter duas regras na
mesma UF; acentos, pontuação e espaços são normalizados. Alterações são auditadas
em `web_access_events` e possuem controle de versão contra gravações concorrentes.

Importação inicial: 468 regras da aba “Divisões administrativas” do arquivo
privado “Divisão Vendedores Comercial.xlsx”. As outras abas não possuem a divisão
completa por Estado/Orçamentista. A importação não envia mensagens nem reatribui
as tarefas existentes. O arquivo original continua fora do Git.

A sincronização utiliza as regras somente na criação de novas tarefas de origem
**Preventiva de Equipamento de Cliente**. Cruza os vínculos atuais do equipamento
com os clientes, município e UF do cadastro. Todos os vínculos precisam resolver
para um único responsável ativo. Ausência de localização, ausência de regra ou
conflito entre responsáveis mantém a tarefa sem atribuição. Tarefas manuais, de
locação e de outras origens não entram na regra.

A atribuição inicial registra o nome e o critério no histórico e enfileira o aviso
normal de nova tarefa para o WhatsApp do responsável. Sem telefone válido/usuário
ativo a rotina de entrega não envia. A carga histórica silenciosa feita antes
permanece sem avisos; não é executada novamente.

Aplicar `web/sql/013_task_territories.sql` antes de publicar o código. Migração e
468 regras já aplicadas ao banco configurado em 24/09/2026. O script
`web/scripts/import-task-territory-rules.mts` não sobrescreve regras existentes.

## Locações e empréstimos

Novas tarefas automáticas de **Máquina de Locação** e **Máquina Emprestada** são
atribuídas à Sara (`atendimento@rjserranacompressores.com.br`), desde que seu
cadastro esteja ativo. Essa regra independe da cidade/UF e registra nota e aviso
normal de atribuição. Não abrange tarefas manuais nem preventivas de equipamentos
locados. Responsáveis já definidos são preservados pela sincronização.

O script `web/scripts/assign-rental-tasks.mts` atribui as tarefas abertas dessas
origens à Sara em uma carga auditada, sem avisos em massa. Preserva concluídas,
incrementa a versão e registra o histórico anterior no log administrativo.

A tabela e o formulário apresentam todas as colunas da planilha principal:
Cidade, Mesorregião, Microrregião, Vendedor, Estado e Orçamentista. A pesquisa
considera todos esses campos. Vendedor e regiões são textos editáveis; o
orçamentista continua vinculado a um funcionário ativo para atribuir tarefas.
A migração `014_task_territory_columns.sql` acrescenta os campos informativos.
O importador preenche apenas campos ainda nulos, preservando edições e responsáveis.

## Configurações de Tarefas

A aba **Tarefas → Configurações de Tarefas** reúne as origens suportadas,
critérios atuais de abertura/vencimento, responsáveis automáticos e a tabela
comercial. Administradores editam as atribuições por origem; demais usuários
consultam as regras. Não é possível substituir a regra de preventiva de cliente,
que permanece **Conforme Divisão Comercial**.

A migração `015_task_origin_rules.sql` armazena atribuições por origem e inicia
locações e empréstimos com Sara. As outras preventivas começam sem responsável
automático. É possível selecionar qualquer funcionário ativo ou desativar a
atribuição automática de uma origem. Mudanças são auditadas, possuem controle de
versão e só afetam novas tarefas. O aviso de atribuição segue o fluxo existente.

As regras de vencimento são informativas: o prazo continua vindo do contrato ou
do plano preventivo; tarefas manuais usam a data escolhida pelo usuário. Editar
uma atribuição não muda vencimentos, alertas nem responsáveis de tarefas antigas.
