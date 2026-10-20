# Portal Vendas RJ — primeira etapa

Acesso pelo módulo **Visitas** ou `/visitas`. Login próprio: `/vendas/entrar`.
Esta etapa é web, responsiva e on-line. O APK e novos perfis de gestão ficam para etapas posteriores.

## Preparação da carteira

1. Cadastre o funcionário ativo com cargo `Vendedor` ou `Vendedora`.
2. Em Administração → Divisão comercial, selecione o usuário na coluna Vendedor das cidades/UF correspondentes e salve a linha.
3. O texto legado é preservado. Enquanto não houver usuário vinculado, a seleção fica amarela.

A atribuição existente do orçamentista permanece independente. A mudança de vendedor afeta imediatamente a carteira de visitas. Clientes sem divisão vinculada não são expostos aos vendedores. Usuários administradores podem acessar a interface, mas não recebem acesso global às visitas; os perfis de gestão ainda não foram implementados.

## Regras

- Base: somente clientes com vínculo atual de máquina (`m8_person_equipment.present`), em qualquer empresa M8. Leads próprios permanecem disponíveis. `m8_customer_directory`, uma entrada por `person_id`, utilizando o cadastro mais recentemente coletado entre empresas M8.
- Carteira: cidade/UF do cadastro comparada com a divisão comercial, normalizando acentos e pontuação da cidade.
- Sem histórico ou seis meses completos desde a última realização: vencida.
- Cinco meses completos até antes de seis: próxima do vencimento.
- Menos de cinco meses: em dia.
- Os intervalos usam meses de calendário, com ajuste para o último dia dos meses menores, em Brasília.
- Agendamentos não atualizam a situação da carteira. Só a realização, inclusive o registro retroativo, altera a última visita.
- Leads são identificados pelo prefixo `Lead` e pertencem apenas ao usuário que os criou.
- Histórico detalhado e alterações limitados ao autor da visita e à carteira atual. A data da última realização acompanha o cliente, mesmo se a divisão mudar de vendedor.
- O mapa reutiliza coordenadas cadastradas; clientes sem posição são indicados e continuam na lista. Não há geocodificação automática de Leads nesta etapa.

## Implantação e validação

Migração aditiva: `web/sql/052_sales_visits.sql`. Adiciona `seller_user` à divisão, tabelas de Leads e visitas, índices e RLS. Não migra nomes de vendedores automaticamente e não cria visitas fictícias. Aplique também `web/sql/053_sales_customer_locations.sql` para armazenar os ajustes manuais de localização de clientes e Leads.

API: `/api/visits`, autenticação de sessão existente, validação de cargo e carteira no servidor, proteção de origem para alterações, auditoria em `web_access_events`. Criação usa UUID para evitar duplicação em reenvios; realização/cancelamento valida versão e situação. A consulta consolidada fica restrita a administradores em `/api/visits/management`.

Testes: `sales-visits.test.ts`, `sales-visits.spec.ts`, `task-territories.test.ts` e `task-territories.spec.ts`.

## Gestão de Visitas

Administradores acessam `/visitas/gestao` pelo módulo Visitas ou pelo link no Portal Vendas. A API `/api/visits/management` valida cargo/perfil no servidor: vendedores não podem consultar a carteira consolidada. A Gestão consulta visitas de todos os vendedores sem alterar seus agendamentos. Administradores também podem registrar o horímetro de equipamentos pelo mapa, usando as validações e o histórico do módulo de Equipamentos.

- Visão geral: carteira, Leads, visitas realizadas, agendadas, canceladas e atrasadas; situação da carteira e evolução mensal.
- Vendedores: comparativo e seleção individual, incluindo usuários inativos com histórico.
- Visitas: histórico completo, inclusive clientes que saíram da carteira ou deixaram de ter máquinas; lista paginada.
- Calendário: distribuição pela data agendada, com status e vendedor.
- Mapa: carteira e clientes com histórico, posição dos vendedores e consulta do cliente/equipamentos.

Filtros de vendedor, cliente, status e período. O período usa a data de realização nas visitas realizadas e a data agendada nas demais; a carteira representa os vínculos atuais da divisão comercial e os Leads de cada proprietário. Visitas antigas preservam o vendedor original. Posições sem coordenadas não são inventadas e continuam disponíveis nas outras visões. A página atualiza a consulta a cada minuto enquanto estiver visível.

O mapa possui a opção Divisão Comercial, com limites municipais e legenda pelo usuário vendedor vinculado (ou texto legado quando não há vínculo). O registro de horímetro permite editar a data da coleta, sem datas futuras, e salva no módulo de Equipamentos.
