# Portal do técnico — piloto web

Acesso: `/tecnico`, pelo menu Assistência Técnica → Portal do técnico. Usa o usuário autenticado e habilitado do sistema. Controle de Despesas e Indicação de Vendas são atalhos desabilitados neste piloto.

## Preparar e enviar

1. Em Programação → Configurações → Causas de pausa, cadastrar causas e o limite opcional de alerta em minutos.
2. Programar a operação com data, responsável, equipe de apoio e, para deslocamento, veículo. Selecionar o checklist quando necessário e salvar.
3. Clicar em **Enviar ao técnico**. O envio libera as etapas do checklist e disponibiliza a operação ao responsável e à equipe de apoio.

O portal lista somente operações enviadas e atribuídas ao usuário, agrupadas por OS, da programação mais recente para a mais antiga. Operações concluídas deixam a lista.

## Execução

- Cada técnico confirma as peças em cada operação antes dos demais registros, mesmo sem retirada. As quantidades são totais compartilhados da OS, com indicação da operação e do autor da última alteração. Edições concorrentes são rejeitadas para evitar sobrescrita silenciosa. A coleta dos materiais precisa estar finalizada.
- Atividade e deslocamento têm registros persistidos no servidor: fechar a página não encerra a contagem. Só pode existir um apontamento ativo por técnico. Pausas são medidas separadamente e descontadas das horas trabalhadas.
- Deslocamento exige odômetro inicial e final; a diferença não representa rastreamento automático do veículo.
- O responsável envia parcial ou completo. O envio completo exige todas as etapas do checklist devolvidas e nenhum apontamento da equipe em aberto. A operação passa para Aguardando Revisão.
- Registros exigem localização recente (latitude, longitude, precisão e horário). É necessário permitir localização e usar HTTPS no telefone. O piloto requer internet e não possui fila offline.
- O alerta de pausa aparece enquanto a página está aberta; ao retornar à página, o limite também é conferido. Não há push com o aplicativo fechado nesta etapa.

## Persistência e validação

Migração `web/sql/037_field_operations.sql`: conferências individuais, sessões e eventos auditáveis com GPS; preserva `web_service_item_usage` para quantidades e os eventos existentes de mão de obra. Ações usam transação, bloqueio de programação, versões de itens e identificador de requisição. Não expõe custos no endpoint de campo.

Testes: `field-operations.test.ts`, `service-scheduling.test.ts` e `field-app.spec.ts` (celular de 390 px). APK, mapa, notificações push e modo offline ficam para etapas posteriores.

## Publicação restrita a administradores

Enquanto o piloto é validado, `/programacao`, `/tecnico` e todas as APIs novas (incluindo fotos, PDF e vínculos de OS) exigem administrador habilitado. A atribuição da operação continua necessária no portal, inclusive para o administrador que testa como técnico.

Os componentes existentes selecionam `.preview.tsx` apenas com o perfil de administrador verificado no servidor; `.stable.tsx` mantém a interface do commit `e50c6a3` para os demais usuários. Consultas de histórico, custos e equipamentos também selecionam a implementação por perfil. CSS novo é limitado a `body.admin-preview`. As regras anteriores de geração automática de tarefas permanecem durante a validação. Dados já gravados não são apagados nem isolados em outra base.

Para liberar depois, remover a seleção de versões estáveis e revisar os bloqueios `requireAdmin` nas APIs novas. Não basta mostrar o link no menu. Teste de acesso: `tests/admin-rollout.spec.ts`, habilitado com `M8_ROLLOUT_TESTS=1` e sessões de teste de administrador e usuário comum.

Validação da publicação de 29/09/2026: build de produção aprovado; quatro testes de navegador aprovados (administrador, usuário comum com acesso direto negado, fluxo móvel e programação). Suíte unitária: 126/129; as três falhas de equipamentos vinculados, catálogo e orçamentos foram reproduzidas no commit base `e50c6a3`, com os mesmos resultados, antes da publicação. Documentos de clientes, arquivos de ambiente, configurações locais e certificados privados não foram incluídos.

O preenchimento do relatório abre em uma tela que ocupa toda a área útil do navegador, com retorno fixo no topo e ações Salvar/Enviar no rodapé. Os rascunhos permanecem ao voltar ao menu e reabrir o relatório enquanto a operação continuar aberta. Não substitui salvar antes de sair da página. A organização móvel foi validada em Chromium e WebKit, em larguras de 390 e 320 px.

### Ajustes de apontamentos e aprovação

A estrutura desta funcionalidade é instalada por
`web/sql/038_time_adjustment_requests.sql`. Antes da instalação, a consulta das
programações permanece disponível e as ações de ajuste ficam desabilitadas.
Migração aplicada no banco compartilhado em 29/09/2026, com autorização do usuário.

- Configuração de funcionário: seleção de um ou mais gestores ativos; não permite
  autoatribuição. Os gestores podem ser adicionados/removidos individualmente.
- Programação → Apontamentos: coordenadas originais de início/fim e das pausas,
  ajuste direto de registros encerrados pelo planejador, com justificativa.
- Portal técnico → Meus apontamentos: consulta dos próprios registros, solicitação
  de correção e inclusão manual com motivo. Horários informados em Brasília.
- Solicitações pendentes não alteram horas nem custos. Cada gestor recebe uma
  tarefa, com identificação da OS/operação, motivo e horários. A aprovação por
  qualquer gestor ainda cadastrado aplica a mudança e conclui todas as tarefas
  da solicitação. Rejeição exige motivo e também encerra as tarefas.
- O técnico não pode aprovar sua própria solicitação. A aprovação é transacional
  e verifica novamente sobreposição e versão. Registros em andamento precisam
  ser encerrados antes de solicitar ajuste.
- Correções preservam horários e GPS originais; o histórico registra pedido,
  motivo, autor e análise. A localização de um lançamento manual é identificada
  como o local da solicitação, nunca como o local histórico da atividade.
- O piloto continua restrito a administradores, inclusive APIs e tarefas novas;
  a configuração de gestores não concede acesso administrativo.
- Não há envio ao GitHub, publicação ou migração de produção sem autorização
  explícita do usuário.

### Envio e devolução do relatório

Na linha da operação, o planejamento vê o status do relatório: Salvo, Enviado
parcial, Enviado completo ou Devolvido para edição. O técnico pode salvar e
continuar editando após envio parcial; somente o envio completo submete todas
as etapas e bloqueia a edição. Ambos os envios salvam os campos atuais na mesma
transação, sem perder o rascunho da tela.

O botão **Devolver relatório ao técnico** aparece diretamente nas ações da
operação para relatórios enviados completos, antes da revisão/conclusão.
A devolução libera todas as etapas preenchidas, preserva respostas e fotos,
registra o autor e arquiva o comprovante anterior. Se a operação estava
aguardando revisão, volta para execução. Relatórios já revisados (com efeitos
no equipamento/preventivas) não são reabertos por esta ação.
