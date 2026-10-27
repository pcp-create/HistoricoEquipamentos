# Lista de verificação da tarefa

O bloco **Lista de verificação** aparece na coluna esquerda, abaixo de **Informações da tarefa**. **Criar lista** adiciona uma lista com nome; cada lista mostra o total concluído. **+ Adicionar Item** abre um campo com bolinha à esquerda: Enter salva e retorna ao botão, e Esc descarta o texto e retorna sem fechar a tarefa. Os itens são separados por divisórias horizontais. A bolinha marca ou desmarca o item, mantendo os pendentes no início e os concluídos no final, em verde e com texto tachado. Marcar um item não conclui a tarefa principal. A marcação e o contador são atualizados imediatamente enquanto o servidor valida a operação. Em caso de falha, a alteração visual é revertida; em caso de conflito, a lista atual é recarregada. Durante o salvamento, as ações ficam bloqueadas para evitar operações sobre versões antigas.

Cada item possui botões de lápis para editar o título na própria linha e lixeira para remover após confirmação. A edição oferece salvar e cancelar (também por Esc). Edição e remoção validam a versão do item e seu vínculo com a tarefa.

Listas e itens são persistidos separadamente por tarefa. As operações exigem usuário ativo e respeitam o acesso às tarefas restritas. Cada marcação registra autor, data e versão; se outra pessoa alterar o item, a tela recarrega a lista e solicita nova tentativa. Criar listas ou itens com o mesmo identificador é idempotente.

Instalação da migration aditiva, sem modificar as tabelas existentes de tarefas:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-task-checklists.mts
```

O instalador registra a migration `079_task_checklists.sql` com checksum. A API usa `/api/tasks/checklists` e nunca publica essas tabelas para acesso direto anônimo.

O título da lista pode ser renomeado pelo lápis ao lado do nome, sem fundo ou borda. O ícone aparece ao passar o mouse ou focar pelo teclado; em dispositivos de toque, permanece visível. Enter salva e Esc cancela. A gravação verifica o título anterior para evitar sobrescrever uma alteração simultânea.

Durante a edição do título, a lixeira permite excluir a lista inteira e seus itens após confirmação. A exclusão respeita as permissões da tarefa e verifica se o título foi alterado por outra pessoa.
