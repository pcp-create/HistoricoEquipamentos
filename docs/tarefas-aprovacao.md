# Tarefas de aprovação

Na criação de tarefas, selecione **Tarefa padrão** ou **Tarefa de aprovação**. A aprovação exige descrição e responsável ativo com WhatsApp cadastrado. Não utiliza etapas de cargos nem a opção de restrição administrativa das tarefas comuns.

O responsável visualiza a descrição e as ações **Aprovar** e **Reprovar**. Apenas o responsável atribuído pode decidir. A reprovação exige justificativa (até 2.000 caracteres); a aprovação registra o de acordo. Cada decisão é única e protegida por versão e bloqueio transacional.

A mesma tarefa retorna ao usuário que a criou, em andamento, com a decisão, autor, data e justificativa preservados. O solicitante recebe uma notificação na fila existente e pode **Concluir tratativa** após receber o resultado. A aprovação não executa automaticamente o processo de negócio. Uma nova rodada de análise requer nova solicitação; não altera a decisão anterior.

Tarefas de aprovação não podem ser movidas, reatribuídas, ter notas apagadas ou ser encerradas pelos controles genéricos. O fluxo usa a descrição salva na criação, evitando que a solicitação mude durante a análise.

As notificações do BOT contêm a descrição e o link para a tarefa; o retorno inclui a decisão/justificativa. Os botões de decisão ficam na tela da tarefa, com autenticação. Esta implementação não envia botões interativos diretamente pelo WhatsApp.

Aplicar `web/sql/073_task_approvals.sql` antes de publicar. Migração aplicada na base configurada durante o desenvolvimento. Nenhuma mensagem real foi disparada pelos testes.
