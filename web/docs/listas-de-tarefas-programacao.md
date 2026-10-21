# Listas de tarefas da programação

Disponível para usuários autenticados e ativos, como os demais recursos da programação.

- **Criar Lista de Tarefas**, ao lado de Adicionar operação, captura as operações já salvas da OS, na ordem da programação.
- **Configurações → Listas de Tarefas** permite criar diretamente, pesquisar, editar, reordenar operações e excluir listas.
- Cada lista guarda todos os campos de planejamento ou apenas os selecionados. Datas, horários de início, status, envio ao técnico, histórico, respostas de checklist, fotos e apontamentos não são copiados. O cargo é derivado do responsável.
- **Atribuir Lista de Tarefas** apresenta uma prévia e exige confirmação para substituir todas as operações. As novas operações ficam Pendentes, sem data e horário; campos omitidos ficam vazios e o calendário assume Padrão.
- Alterações não salvas na OS impedem abrir os comandos. A gravação verifica novamente as versões das operações e da lista. Toda substituição ocorre numa transação, com arquivo das operações e eventos anteriores na auditoria.
- Operações já enviadas ao técnico, com relatórios, registros de execução, apontamentos ou peças atribuídas não podem ser substituídas por uma lista.
- Listas excluídas são arquivadas. Alterações ou exclusões não afetam operações anteriormente atribuídas.

## Banco

Antes de publicar, executar `node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-schedule-task-lists.mts` a partir de `web`. A migração idempotente `059_schedule_task_lists.sql` cria a tabela com RLS e sem acesso direto pelos clientes.

## Validação

- `node --conditions=react-server --import tsx --test tests/schedule-task-lists.test.ts`
- `npx playwright test tests/schedule-task-lists.spec.ts`
- `npx tsc --noEmit`
