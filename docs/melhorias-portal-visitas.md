# Melhorias no Portal de Visitas

## Pendências após a realização

Ao concluir uma visita realizada, o portal pergunta se existe pendência. Sem pendência, mantém o encerramento automático anterior. Com pendência, registra a visita normalmente e mantém a mesma tarefa aberta, convertida em tratativa manual vinculada à visita. Em seguida abre o formulário existente para escolher o responsável, vencimento, prioridade e informar o motivo/demanda. Se a janela for fechada, a visita continua registrada e a tarefa permanece aberta para o vendedor até ser direcionada.

A tarefa conserva seu ID e os registros anteriores. As notas acrescentam cliente, contato, data, relato, máquinas/horímetros e referências às fotos. Pode ser concluída manualmente no Kanban. Editar a visita depois não encerra automaticamente essa tratativa. A atribuição exige usuário ativo com WhatsApp, como nas demais tarefas. Os botões de tarefa são apresentados para todos os perfis nas visitas que podem acessar; as verificações de proprietário/gestor permanecem no servidor.

## Equipamentos

É possível inativar um equipamento integrado ou aguardando cadastro, mediante justificativa. A inativação é local ao vínculo cliente/equipamento do portal de visitas: não altera nem exclui o cadastro no ERP. A lista principal exibe os ativos; os inativos ficam recolhidos em “Expandir equipamentos inativos”, mostrando data e motivo. Todas as ações são verificadas no servidor e auditadas.

Antes da publicação, aplicar:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-visit-equipment-inactivation.mts
```

O script aplica `097_visit_equipment_inactivation.sql`. A leitura continua compatível com um banco ainda sem a tabela; a ação de inativar requer a migration.

## Registro e fotos

- Horímetros não mudam com a rolagem do mouse.
- Até 10 fotos, comprimidas no navegador para respeitar o limite do envio. O servidor valida o total e o conteúdo das imagens.
- Remoção pelo X no canto superior direito da miniatura, com nome acessível.
- Desmarcar e remarcar uma máquina restaura descrição, horímetro e data digitados. O rascunho existe apenas enquanto aquele formulário está aberto e é descartado ao salvar/fechar; não é transferido para outra visita.

## Validação

`tests/sales-visits.test.ts`, `tests/visit-records.test.ts`, `tests/visit-equipment-inactivation.test.ts` verificam o reaproveitamento da tarefa, atribuição por usuário comum, fechamento manual, 10 fotos, acesso/inativação com justificativa e preservação do ERP. `tests/visit-improvements.spec.ts` cobre rascunhos, rolagem real do mouse, fotos, inativos recolhidos e formulário de direcionamento.

### Direcionamento da tarefa da visita

A ação Direcionar tarefa mantém o mesmo número e o histórico da tarefa, inclusive nas visitas agendadas. Se a tarefa estiver concluída, o direcionamento reabre a mesma tarefa para o responsável selecionado. Não é gerada outra tarefa a cada direcionamento. Os botões Direcionar tarefa e Cancelar ficam lado a lado na janela. Nas visitas realizadas, Editar não é exibido.

A referência da tarefa aparece como hiperlink TAR-número, acompanhada do status real da tarefa em um selo colorido (não iniciada, em andamento ou concluída). O botão de direcionamento é compacto e fica na mesma linha; depois do direcionamento é substituído pelo nome do responsável.

Ao concluir a visita, uma janela oferece Direcionar ou Fechar para a pendência. Depois de fechar essa janela ou concluir/fechar o formulário de direcionamento, é oferecido o agendamento da próxima visita. O formulário de direcionamento inclui a opção “Acompanhar esta tarefa e receber atualizações”; desmarcá-la remove o próprio usuário dos acompanhantes da tarefa e da visita, preservando os demais acompanhantes.
