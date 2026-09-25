# Tarefas vinculadas a OS e equipamentos

O menu de três pontos oferece **Criar tarefa** na lista de OS, no painel de
detalhes, nos links de histórico de vendas/orçamentos e na tela de equipamentos
(última OS, histórico e ações do equipamento).

O formulário traz o número da OS, cliente e equipamentos identificados. Permite
preencher título, descrição, responsável, prioridade e vencimento. Quando há
mais de um equipamento na OS, pode selecionar um ou vincular somente à OS.
A criação valida empresa, identificador real da OS e vínculo com o equipamento
no servidor. O detalhe da tarefa apresenta o link da OS em uma nova aba.

Essas tarefas seguem o ciclo manual: podem ser concluídas e reabertas pelo
usuário, sem conclusão automática pela situação da OS. A atribuição usa os
avisos existentes. A migração `016_task_order_links.sql` foi aplicada ao banco
configurado; os novos campos não alteram as tarefas anteriores.
