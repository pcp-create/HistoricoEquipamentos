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
