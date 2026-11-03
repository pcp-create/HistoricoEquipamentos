# Correções de execução de OS — 03/11/2026

## Instalação

Aplicar antes da publicação web:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-service-execution-workflow.mts
```

A rotina aplica `093_service_execution_workflow.sql`: tarefa única por operação, liberações da programação, vínculo de correção de aprovação e fila de relatórios ao cliente. Estas correções não exigem atualização do integrador.

Distribuir o APK **2.2.9**, código 19. A interface e o projetor offline são empacotados; atualizar somente o servidor não atualiza aparelhos instalados. Instalar por cima da versão anterior, com a mesma assinatura, após sincronizar as pendências.

## Almoxarifado

A fila Para entrega considera também o relacionamento da OS, nos dois sentidos. Uma OS aberta vinculada a outra em separação aparece mesmo que seu fluxo individual seja diferente. As OSs mantêm materiais e movimentos independentes; o seletor entre principal e vinculada identifica empresa e número. Quantidades e unidades continuam sendo validadas na OS de origem.

Na inclusão de material, escolher a OS de destino antes de pesquisar o catálogo. O catálogo acompanha a empresa selecionada. Na OS principal de situação cobrança, o formulário explica a criação de tarefa e permite informar o Orçamentista. Sem escolha explícita, o servidor procura o responsável de orçamento nas tarefas da OS ou o único Orçamentista ativo. Ambiguidade exige seleção; usuário inativo ou sem WhatsApp impede o envio ao ERP antes de qualquer gravação.

Após confirmação do item no M8, uma tarefa de inclusão no orçamento é criada na mesma transação da confirmação local, com vínculo à OS, produto, quantidade, valor e justificativa. A chave da inclusão impede duplicidade. Timeout ou gravação incerta permanece bloqueada para conferência no ERP, conforme a regra anterior. A tarefa não altera automaticamente o orçamento nem aprova o material pelo cliente.

## Portal Técnico

- NOK exige comentário identificando o item a substituir e referência, se houver, e ao menos uma foto do próprio campo. A regra funciona também em modelos antigos sem configuração de fotos. Rascunhos podem ser salvos incompletos; o envio exige os complementos. Fotos continuam sendo verificadas por operação, etapa e campo.
- Antes de enviar o relatório, todos os apontamentos abertos da equipe devem ser encerrados. O envio aceita os rascunhos finais após encerrar a atividade. Relatório enviado impede novos apontamentos até devolução pelo planejador; correções de registros existentes mantêm o fluxo de aprovação.
- Devoluções permanecem disponíveis após envio e finalização, inclusive com operação revisada. A retirada acumulada não pode aumentar. O saldo já recebido no Almoxarifado continua protegido e os movimentos são auditados.
- Impressão geral inclui linha do tempo no completo e no resumido. A impressão individual resumida também inclui a cronologia da operação.
- O relatório de orçamento contém o completo mais observações internas, incluindo observações da operação e da OS. Preserva campos públicos vazios, fotos, apontamentos e totais. O completo enviado ao cliente não contém as observações internas.

## Programação e tarefas

O responsável fica bloqueado após envio ao técnico. A devolução do relatório ou da operação para correção reabre essa alteração. Reenvio da operação volta a bloquear o responsável. O equipamento mantém seu bloqueio anterior.

No envio ao técnico é criada uma tarefa de execução por operação. Na finalização, essa mesma tarefa retorna ao planejador que enviou a operação, com mensagem de operação aguardando revisão na fila existente de WhatsApp. Revisão e liberações continuam usando o mesmo ID de tarefa. Atribuição depende de usuário ativo; a entrega de WhatsApp depende do telefone cadastrado e do consumidor de notificações.

A revisão técnica não conclui a operação pelo antigo botão: esse botão foi removido. Depois de todas as operações revisadas, o planejador pode enviar o relatório ao cliente:

1. Enviar o relatório completo revisado ao WhatsApp do cliente, informando país/DDD. A confirmação coloca uma mensagem na fila existente; o PDF é um retrato da revisão e seu link aleatório expira em 14 dias. Envio incerto não é repetido automaticamente.
Os botões de liberação para baixa interna e envio para faturamento foram removidos do cabeçalho da programação. O encaminhamento pelas etapas do Kanban permanece disponível.

As liberações encaminham as mesmas tarefas ao destinatário e permitem que a programação apresente a OS como Revisada. Antes delas, a OS e as operações tecnicamente revisadas permanecem em Aguardando Revisão, inclusive nas contagens dos cartões. Mover uma tarefa vinculada para uma etapa chamada Liberado para baixa interna ou Liberado para faturamento aplica a mesma validação de liberação de toda a OS. Processamento efetivo da OS e emissão fiscal permanecem no ERP.

O cabeçalho permite editar Observação, Observação Interna e Status Fluxo. Usa a edição durável já existente do M8, com conferência de versão, preservação dos demais campos e acompanhamento de resultado incerto. O botão Criar OS abre o formulário já existente de criação no ERP.

## Aprovação reprovada

O solicitante pode criar uma nova solicitação corrigida, com descrição obrigatória da tratativa. O sistema preserva a decisão anterior, cria um vínculo entre ambas e encaminha a nova ao aprovador original. Uma recusa origina no máximo uma correção direta; se a nova solicitação também for recusada, ela pode originar a próxima rodada. Notas guardam os links nos dois sentidos. Não há reabertura ou sobrescrita da decisão anterior.

## TECHTO 4074

Conforme validação do usuário, o comportamento atual está correto: o TECHTO final de série **4074** deve aparecer somente quando cadastrado como equipamento/produto elegível no ERP. A regra existente foi mantida, sem inclusão automática de produtos da família de locação no catálogo de equipamentos.

## Validação

Testes usam PostgreSQL embarcado, M8 simulado, interceptações de navegador e notificações reclamadas apenas na base de teste. Nenhuma mensagem real é enviada. Cobertura: principal/vinculada, inclusão em cobrança, chave única da tarefa, fotos NOK, envio com cronômetro aberto, devolução após envio, PDF com linha do tempo, relatório de orçamento e observações internas, retorno ao planejador, liberação, correção de reprovação. A regra existente de elegibilidade do catálogo de equipamentos foi preservada.
