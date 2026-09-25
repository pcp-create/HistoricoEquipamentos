# Histórico do processo vinculado à tarefa

A migração `web/sql/020_task_process_history.sql` registra eventos na mesma transação da operação. Não cria alterações retroativas nem dispara mensagens de atribuição.

- Gerar orçamento pelo plano: associa o rascunho à tarefa aberta do plano (ou tarefa agrupada), inclui nota com número/link e muda Não iniciado para Em andamento. Repetir a mesma solicitação não duplica orçamento ou nota.
- Salvar/excluir esse orçamento: inclui nota nas tarefas associadas; não reabre tarefas concluídas. Materiais e serviços do orçamento fazem parte da atualização.
- Alterações do plano, registros de manutenção e dados operacionais do equipamento: incluem notas nas tarefas abertas do contexto. A conclusão das preventivas continua pela sincronização do processo.
- OS explicitamente vinculada, ou origem locação/empréstimo: mudanças de status, valores, entrega, observação e cliente são registradas, assim como mudanças nos materiais e serviços da OS. Repetições da sincronização sem alteração relevante não geram notas.
- Uma nota avulsa não muda o andamento. Atribuir automaticamente uma preventiva também não presume que o trabalho começou.

O histórico limita-se ao processo vinculado. Mudanças gerais de cadastro de produtos e estoque não são copiadas para tarefas.

Registros feitos na aplicação preservam o usuário responsável. Notas de integração identificam a Integração M8, sem presumir autoria humana.
