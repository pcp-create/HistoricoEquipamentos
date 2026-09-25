# Revisões de preventivas e tarefa única

Revisões por horas de um equipamento seguem a inclusão das revisões menores já usada no registro de manutenção. Entre os planos por horas em alerta (vencido, limite atingido ou próximos 30 dias), a maior revisão concentra a tratativa. As menores permanecem cadastradas, com histórico e intervalos originais, e aparecem como incluídas na maior. Planos sem previsão válida não ocultam alertas. Planos exclusivamente por meses permanecem independentes.

Exemplo com manutenção registrada a cada etapa: 2.000 → 4.000 → 2.000 aos 6.000 → 8.000 → 2.000 aos 10.000 → 12.000. Nenhuma manutenção é presumida ou gravada apenas pela passagem do tempo. A projeção mantém horas/meses, o que ocorrer primeiro. No relatório, planos cobertos não duplicam linhas de alerta.

A tarefa usa uma chave por equipamento (`preventive-group:<id>`). Se a revisão maior entrar no alerta antes da execução, a mesma tarefa muda de escopo e mantém notas, responsável e número. Uma nova intervenção real começa outra ocorrência, sem reabrir a anterior. Os vínculos nos planos por horas apontam para essa tarefa compartilhada.

## Ativação e reprocessamento

Aplicar `web/sql/019_preventive_hierarchy.sql` antes da publicação. A regra de tarefas fica desligada até a carga, evitando criação e avisos antes da limpeza.

A partir de `web/`, com ambiente configurado:

```
node --env-file=.env.local --conditions=react-server --import tsx scripts/rebuild-preventive-tasks.mts
node --env-file=.env.local --conditions=react-server --import tsx scripts/rebuild-preventive-tasks.mts --apply
```

A primeira chamada simula. A segunda remove todas as tarefas automáticas de preventivas, inclusive concluídas, conforme autorização específica desta carga; não usar rotineiramente. Mantém tarefas manuais e de locação/empréstimo. Guarda cópia de tarefas, notas, anexos, notificações e lembretes em `.m8/preventive-task-rebuild/`, fora do Git. IDs não são reutilizados.

A limpeza e recriação ocorrem em uma transação sob o bloqueio de sincronização. Se houver notificações/lembretes desses registros em envio, a operação é abortada. Atribuições seguem as regras atuais; tarefas começam como Não iniciado. Os avisos criados na carga são marcados como ignorados antes do commit, sem qualquer janela para envio pelo n8n. A configuração da hierarquia é ativada na mesma transação. As novas ocorrências após a carga voltam a seguir a notificação normal.
