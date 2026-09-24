# Resumo diário de tarefas por WhatsApp

Workflow: `automations/n8n/tarefas-resumo-diario.json`.
Segunda a sexta, às 07:00, fuso `America/Sao_Paulo`.

Cada funcionário ativo com WhatsApp cadastrado e tarefas em aberto recebe uma
mensagem com seu nome, total e quantidades de Pendentes, Em andamento e Atrasadas.
A classificação é a mesma da tela/Kanban; cada tarefa conta uma única vez.
Inclui tarefas manuais e automáticas. Concluídas são excluídas.
Sem tarefas em aberto não há envio. Tarefas sem responsável ficam no indicador
`unassigned` da resposta, sem destino. Contas inativas ou sem telefone válido ficam
em `skipped`. Este resumo é relacionado às tarefas atribuídas, independente dos
flags de relatórios de preventiva/locação no cadastro.

## Configuração

1. Publicar a atualização da aplicação antes de executar o fluxo.
2. Importar o JSON em um workflow novo no n8n.
3. Em **Configuração**, informar `evolutionUrl` e `instance` do bot existente.
4. Em **Gerar resumo diário**, selecionar a credencial do sistema:
   Header Auth `Authorization: Bearer TOKEN`, usando `TASK_AUTOMATION_TOKEN`
   ou `PREVENTIVE_REPORT_TOKEN`. Não usar a credencial Evolution nesse nó.
5. Em **Enviar WhatsApp**, selecionar a credencial Evolution `apikey`.
6. Executar manualmente com `deliver:false`. Conferir `summaries`, `skipped` e
   `unassigned` na saída de **Gerar resumo diário**. Nenhuma mensagem será enviada.
7. Para testar entrega: definir `deliver:true`, `testMode:true` e `testPhone`
   com DDI e DDD. Todos os resumos irão exclusivamente ao número de teste.
8. Após conferir, definir `testMode:false`, manter `deliver:true` e publicar/ativar
   o workflow. Manter apenas uma cópia ativa.

O fluxo atualiza os alertas antes do resumo, sem consumir ou criar notificações
individuais de atribuição. O envio usa um item por responsável, com intervalo de
3 segundos entre itens. Não tem repetição automática configurada: uma reexecução
manual envia novamente, inclusive para quem já recebeu na execução anterior.
O histórico de execuções do n8n registra as respostas de envio; aceitação pela API
Evolution não comprova leitura pelo destinatário.

O JSON é entregue desativado e sem credenciais. Não altera o workflow existente
`tarefas-alertas.json`, que continua cuidando dos avisos de atribuição.
