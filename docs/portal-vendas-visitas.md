# Portal Vendas RJ — primeira etapa

Acesso pelo módulo **Visitas** ou `/visitas`. Login próprio: `/vendas/entrar`.
Esta etapa é web, responsiva e on-line. O APK e novos perfis de gestão ficam para etapas posteriores.

## Preparação da carteira

1. Cadastre o funcionário ativo com cargo `Vendedor` ou `Vendedora`.
2. Em Administração → Divisão comercial, selecione o usuário na coluna Vendedor das cidades/UF correspondentes e salve a linha.
3. O texto legado é preservado. Enquanto não houver usuário vinculado, a seleção fica amarela.

A atribuição existente do orçamentista permanece independente. A mudança de vendedor afeta imediatamente a carteira de visitas. Qualquer usuário ativo pode registrar visitas, mesmo sem cargo de vendedor ou divisão vinculada. O agendamento oferece a opção de buscar em toda a base M8, incluindo clientes sem máquinas; isso não altera a carteira comercial. A Gestão consolida as visitas de todos os usuários.

## Regras

- Base: somente clientes com vínculo atual de máquina (`m8_person_equipment.present`), em qualquer empresa M8. Leads próprios permanecem disponíveis. `m8_customer_directory`, uma entrada por `person_id`, utilizando o cadastro mais recentemente coletado entre empresas M8.
- Carteira: cidade/UF do cadastro comparada com a divisão comercial, normalizando acentos e pontuação da cidade.
- Sem histórico ou seis meses completos desde a última realização: vencida.
- Cinco meses completos até antes de seis: próxima do vencimento.
- Menos de cinco meses: em dia.
- Os intervalos usam meses de calendário, com ajuste para o último dia dos meses menores, em Brasília.
- Agendamentos não atualizam a situação da carteira. Só a realização, inclusive o registro retroativo, altera a última visita.
- Leads são identificados pelo prefixo `Lead` e pertencem apenas ao usuário que os criou.
- No portal, histórico detalhado e alterações ficam limitados ao autor da visita, incluindo seus clientes fora da carteira. A data da última realização acompanha o cliente, mesmo se a divisão mudar de vendedor.
- O mapa reutiliza coordenadas cadastradas; clientes sem posição são indicados e continuam na lista. Não há geocodificação automática de Leads nesta etapa.

## Implantação e validação

Migração aditiva: `web/sql/052_sales_visits.sql`. Adiciona `seller_user` à divisão, tabelas de Leads e visitas, índices e RLS. Não migra nomes de vendedores automaticamente e não cria visitas fictícias. Aplique também `web/sql/053_sales_customer_locations.sql` para armazenar os ajustes manuais de localização de clientes e Leads.

API: `/api/visits`, autenticação de sessão existente, validação de usuário ativo e autoria no servidor, proteção de origem para alterações, auditoria em `web_access_events`. Criação usa UUID para evitar duplicação em reenvios; realização/cancelamento valida versão e situação. A consulta consolidada fica disponível a usuários ativos em `/api/visits/management`.

Testes: `sales-visits.test.ts`, `sales-visits.spec.ts`, `task-territories.test.ts` e `task-territories.spec.ts`.

## Gestão de Visitas

Usuários ativos acessam `/visitas/gestao` pelo módulo Visitas. A API `/api/visits/management` valida no servidor que o usuário está ativo: vendedores também podem consultar a carteira consolidada. A Gestão consulta visitas de todos os usuários e permite agendar uma visita em nome do usuário conectado. Esses usuários também podem registrar o horímetro de equipamentos pelo mapa, usando as validações e o histórico do módulo de Equipamentos.

- Visão geral: carteira, Leads, visitas realizadas, agendadas, canceladas e atrasadas; situação da carteira e evolução mensal.
- Vendedores: comparativo e seleção individual, incluindo usuários inativos com histórico.
- Visitas: histórico completo, inclusive clientes que saíram da carteira ou deixaram de ter máquinas; lista paginada.
- Calendário: distribuição pela data agendada, com status e vendedor.
- Mapa: carteira e clientes com histórico, posição dos vendedores e consulta do cliente/equipamentos.

Filtros de vendedor, cliente, status e período. O período usa a data de realização nas visitas realizadas e a data agendada nas demais; a carteira representa os vínculos atuais da divisão comercial e os Leads de cada proprietário. Visitas antigas preservam o vendedor original. Posições sem coordenadas não são inventadas e continuam disponíveis nas outras visões. A página atualiza a consulta a cada minuto enquanto estiver visível.

O mapa possui a opção Divisão Comercial, com limites municipais e legenda pelo usuário vendedor vinculado (ou texto legado quando não há vínculo). O registro de horímetro permite editar a data da coleta, sem datas futuras, e salva no módulo de Equipamentos.

## Finalidades e clientes fora da carteira

Aplique `web/sql/054_sales_visit_purposes.sql` após as migrações anteriores. Ela cadastra as dez finalidades iniciais e adiciona uma referência opcional às visitas existentes. Novos agendamentos e registros retroativos exigem uma finalidade ativa; visitas antigas continuam podendo ser concluídas sem preenchimento retroativo.

A engrenagem da Gestão abre `/visitas/gestao/configuracoes`, com tabela editável de nome, descrição e situação ativa. Usuários ativos podem configurar as opções, com controle de versão e auditoria. Desativação preserva o histórico. A finalidade aparece junto às visitas no portal e na Gestão.

A opção “Buscar em toda a base de clientes” consulta `/api/visits/customers`, mantendo Leads de outros autores privados no portal. Clientes agendados fora da carteira continuam disponíveis para concluir/cancelar a visita e não são somados aos indicadores da carteira comercial. Alterações de localização usam controle de versão mesmo fora da carteira.

## Localização no agendamento

Ao definir a localização de um cliente ou Lead, o marcador fica fixo no centro e o usuário move o mapa. Busca de endereço e localização atual centralizam o mapa no resultado; a posição só é gravada ao salvar. No Lead, a consulta reversa preenche cidade, UF e endereço; os dados aparecem junto ao mapa e podem ser corrigidos em “Editar endereço”. Para clientes sem endereço cadastrado, o resumo consulta o ponto do mapa sem alterar o cadastro M8. Consultas antigas são canceladas ao trocar o ponto e falhas não apagam a posição.

Configurações de finalidades usam salvamento em lote transacional e controle de versão, com o botão de salvar ao lado de “Adicionar finalidade”. A Gestão usa o cabeçalho web padrão; seu atalho não aparece dentro do Portal do Vendedor.

## Contatos, demandas e alertas de visitas

Aplicar `web/sql/071_visit_contacts_actions.sql` antes de publicar esta versão. A migração preserva o histórico e cadastra os contatos já informados nas visitas. Novos contatos são compartilhados pela chave do cliente (`m8:ID`, sem duplicação por empresa) e podem ser consultados por `GET /api/customer-contacts?customer=m8:ID`. Leads têm contatos isolados por cadastro e acesso conforme seu proprietário.

O calendário oferece Mês, Semana e Dia. Leads aparecem em lista própria e não entram na contagem nem na saúde da carteira de clientes. Ao salvar uma visita realizada, o usuário pode agendar a próxima com cliente e contato preservados; finalidade, descrição, data e hora ficam vazias.

A ação **Criar tarefa da visita** solicita responsável, prioridade e vencimento. Título e descrição são preenchidos com o registro, permanecendo editáveis. A tarefa e o vínculo com a visita são gravados na mesma transação; repetir a mesma solicitação não duplica a tarefa. O criador entra no acompanhamento da tarefa e da visita.

**Receber alerta no meu WhatsApp** agenda uma mensagem para o telefone do usuário, na data e hora escolhidas (Brasília). O alerta usa a automação existente de tarefas: operações `sync` e `reminders` com `deliver: true` incluem mensagens com ID `visit:UUID`; a operação `ack` confirma o envio com o mesmo ID e token. Não é necessário outro fluxo se o integrador atual já encaminha todos os itens de `notifications` e confirma suas entregas. Cancelar uma visita cancela seus alertas pendentes. A leitura de visitas não dispara mensagens.

### Solicitação de cadastro de máquina
Na lista de clientes, expanda **Máquinas** e escolha **Cadastrar máquina**. Informe tipo, modelo, marca, número de série e horímetro. O registro fica vinculado ao cliente como **Cadastro pendente**, com acesso à tarefa gerada para o cadastro definitivo. Não cria automaticamente equipamento no M8.

Em **Configurações de Visitas → Tarefas automáticas**, selecione o responsável pelo cadastro de equipamentos (inicialmente Danieli Oliveira). O destinatário deve estar ativo e ter WhatsApp cadastrado. O criador acompanha a tarefa automaticamente. Registro e tarefa são gravados na mesma transação; reenvios da mesma solicitação não duplicam tarefas. A criação usa a fila de notificações já existente.

Aplicar `web/sql/072_visit_machine_registration.sql` nos ambientes antes da publicação desta funcionalidade.

### Tarefa automática por visita

Cada novo agendamento cria, na mesma transação, uma tarefa automática com origem **Visita comercial**, responsável igual ao vendedor selecionado e vencimento na data da visita (Brasília). O criador entra em **Acompanhamento**, mesmo quando agenda para outro usuário. O cadastro de uma visita já realizada cria e encerra a tarefa na mesma operação. Repetir uma submissão não duplica tarefas nem lembretes. Visitas anteriores à mudança não são convertidas retroativamente.

Ao registrar a realização, a tarefa vinculada é concluída automaticamente e os lembretes pendentes são cancelados. Cancelar ou excluir a visita também encerra sua tarefa, com justificativa no histórico. Alterar o agendamento atualiza o vencimento da tarefa. A sincronização de tarefas de equipamentos não encerra tarefas de visitas; o ciclo é controlado pelo registro da visita. Responsável e acompanhamento do criador são preservados nas ações do módulo de tarefas.

Criação e encerramento usam a fila de notificações de WhatsApp das tarefas, incluindo o vendedor e quem acompanha, conforme cadastro ativo e telefone configurado. No registro direto de uma visita realizada, a tarefa é criada já encerrada e envia somente a notificação de **Tarefa concluída**, sem aviso de criação. Repetir o envio não duplica a notificação. A opção **Agendar lembrete da tarefa para o vendedor** apenas acrescenta um lembrete em `web_task_reminders`, com destinatário igual ao vendedor, e não condiciona a criação da tarefa. A entrega usa o worker e as confirmações já existentes; o portal não envia mensagens diretamente durante a requisição. Novas visitas exibem **Abrir tarefa TAR-…** em seus detalhes.

### Edição por perfil

Todos os usuários ativos podem editar suas próprias visitas no portal, incluindo as agendadas e as realizadas. Administrador e Gestor também podem editar visitas de outros usuários pela gestão. O servidor valida a autoria para usuários comuns, a versão do registro e a situação ativa do usuário; excluir visitas continua restrito aos perfis de gestão. No portal, **Editar** fica ao lado de **Registrar realização** nas visitas agendadas, inclusive no celular.

### Máquinas durante a criação de um Lead

No formulário de um novo Lead é possível adicionar até 20 máquinas antes de salvar a visita, tanto no agendamento quanto no registro de uma realização. O cadastro de tipo, modelo, marca, série, horímetro e observações fica como rascunho na tela, com opção de remover máquinas. Nenhuma solicitação de cadastro é gravada ao adicionar um rascunho ou ao cancelar o formulário.

Ao confirmar a visita, Lead, contato, visita, máquinas e respectivas tarefas de cadastro são gravados na mesma transação. O responsável configurado para cadastro de máquinas recebe as tarefas; o criador fica em acompanhamento. Na visita realizada, também podem ser incluídas observações sobre as máquinas recém-adicionadas. Falhas preservam os rascunhos no formulário e revertem a gravação parcial; repetir o envio da visita não duplica máquinas nem tarefas. O fluxo mantém o cadastro de equipamentos via tarefa, sem escrever diretamente no catálogo M8.
