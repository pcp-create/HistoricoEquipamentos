# Módulo Tarefas

Acesso: Módulos → Tarefas → Acompanhamento. Todos os usuários autorizados podem consultar tarefas, atribuir funcionários ativos, registrar notas e anexar arquivos. Não é uma tela exclusiva de administradores. “Minhas tarefas” usa a identidade autenticada, nunca um e-mail fornecido pela interface.

## Ocorrências e ciclo de vida

- Contratos: mesma regra das máquinas, menos de 30 dias restantes ou vencidos; chave equipamento + empresa + OS. Origens Locação e Empréstimo distintas.
- Preventivas: um processo por plano, reutilizando o cálculo de horímetro/calendário existente; alerta próximo, vencido ou vencendo hoje. Origens distinguem equipamento de cliente, locado, emprestado e frota própria.
- A primeira sincronização cria tarefas para alertas já existentes, com data de criação daquela coleta (não inventa quando o alerta começou).
- Não iniciado: sem responsável. A atribuição muda para Em andamento e registra o momento da primeira ação; o tempo de espera inicial permanece disponível.
- Prioridade automática: vencido/vencendo hoje = Urgente; contrato com menos de 5 dias = Alta; demais próximos = Normal. Prioridade manual é preservada. Ao voltar ao modo automático, a próxima verificação reaplica a prioridade calculada.
- Regularização encerra a ocorrência e registra nota automática. Plano arquivado, equipamento removido da base ativa ou contrato substituído também encerram a ocorrência com o motivo. Mudança da referência da última intervenção inicia um novo ciclo do plano, se ainda houver alerta.
- Dados incompletos/inconsistentes não confirmam regularização. Falha na leitura da base cancela a sincronização inteira.
- Tarefas concluídas nunca reabrem. Novo alerta após regularização gera outro número/histórico. Notas/anexos ainda podem ser acrescentados ao histórico concluído; responsável e prioridade ficam bloqueados.
- Índice único impede duas tarefas abertas para a mesma origem. Sincronização serializada e transacional; edição usa versão para impedir sobrescrita concorrente.

## Interface

Listas geral e pessoal, busca, filtro de status e calendário mensal baseado no vencimento do processo. Sem data aparece em bloco próprio. Números TAR-… abrem painel lateral direito (Escape fecha). Links na situação do equipamento e no plano mostram ocorrências atuais e anteriores. Notas têm título, descrição, autor e data, em ordem cronológica inversa. Anexos PDF, Word (.doc/.docx), Excel (.xls/.xlsx) e PowerPoint (.ppt/.pptx/.pps/.ppsx), com extensão validada na interface e no servidor, até 3 MB, máximo 20 por tarefa; armazenados no banco com acesso autenticado e download forçado, nunca publicados em bucket aberto. Não há remoção de histórico nesta versão.

## Sincronização e avisos por WhatsApp

Ao abrir Tarefas/Equipamentos, os alertas são conferidos; as telas abertas atualizam a cada minuto. Salvamento de operação/plano também solicita conferência. Para funcionar sem nenhuma tela aberta, **ativar o workflow** `automations/n8n/tarefas-alertas.json` (a cada 5 minutos, todos os dias). O sistema detecta transições observadas entre coletas; uma mudança e reversão inteiramente entre duas coletas não produz uma ocorrência histórica.

Atribuições geram uma fila transacional de avisos (independente das preferências de relatórios). O responsável precisa ter WhatsApp cadastrado. Reatribuição gera novo aviso ao novo responsável. Alterar só prioridade/nota não gera aviso de atribuição. Antes de entregar, a fila revalida funcionário ativo, telefone e atribuição atual, ignorando avisos obsoletos. A tela informa pendente, enviado ou não enviado.

No n8n:
1. Aplicar `web/sql/010_tasks.sql` após 008/009 e publicar aplicação.
2. Importar `tarefas-alertas.json`. Configurar URL da aplicação, Evolution e instância.
3. Nos nós **Sincronizar tarefas** e **Confirmar entrega**, usar Header Auth `Authorization: Bearer TOKEN`. A API usa `TASK_AUTOMATION_TOKEN`, ou `PREVENTIVE_REPORT_TOKEN` quando o primeiro não estiver definido.
4. Em **Enviar WhatsApp**, usar Header Auth `apikey` da Evolution.
5. `deliver:false` verifica e cria/conclui tarefas, sem reclamar/enviar avisos. Testar assim primeiro. Não existe envio para número fixo: os avisos são sempre direcionados ao responsável cadastrado.
6. Para enviar a fila, mudar para `deliver:true` e ativar/publicar o workflow. Não desabilitar envio deixando a confirmação ativa.

A confirmação só ocorre após resposta bem-sucedida da Evolution. Reserva de 30 minutos evita que duas execuções reclamem simultaneamente a mesma notificação; depois desse prazo, falhas não confirmadas voltam à fila. Não há garantia de entrega exatamente uma vez: se a Evolution aceitar e a confirmação falhar, a repetição pode duplicar o aviso. Resposta de sucesso indica aceitação pela Evolution, não comprova leitura pelo destinatário.

Esta implantação não configura nem ativa remotamente o n8n e não envia avisos durante os testes. Frequências dos relatórios diários/semanais/mensais permanecem independentes.

## Kanban e status de execução

Aplicar também `web/sql/011_task_kanban.sql`. Responsáveis (Todos/Minhas tarefas) ficam separados dos modos Lista/Calendário/Kanban. O filtro de status começa em Todos, para que concluídas também apareçam no quadro.

Colunas: Pendentes, Em andamento, Atrasadas e Concluídas. Sem movimentação manual, tarefas abertas com data de vencimento anterior ao dia atual em Brasília aparecem em Atrasadas. O arraste ou seletor do cartão grava a coluna de execução explicitamente, registra nota e atualiza o último modificador. É necessário atribuir responsável para mover para Em andamento. Troca de responsável recalcula o estado de execução; mudança apenas de prioridade preserva a coluna escolhida.

A coluna de execução não modifica a data ou situação do contrato/plano. Conclusão pelo Kanban é manual e não significa regularização do alerta de origem. A tarefa concluída nunca é reaberta e não é duplicada pela sincronização enquanto o mesmo alerta continuar ativo. Após regularização observada e novo alerta, cria-se nova ocorrência. A opção Mover tarefa oferece a mesma ação para teclado e celular.

### Tarefas manuais

O botão **Nova tarefa** permite informar título, descrição, responsável ativo,
prioridade e vencimento. Responsável e prazo são opcionais. A atribuição gera
um aviso na mesma fila de WhatsApp das tarefas automáticas e exige telefone
cadastrado. A origem aparece como **Tarefa manual**, com o nome do criador.
Notas, anexos, Kanban, calendário e gráfico também estão disponíveis.
A sincronização dos alertas não encerra tarefas manuais; a conclusão é feita
pelo usuário. Tarefas manuais concluídas podem ser reabertas nos detalhes, mantendo responsável e prazo, com registro no histórico. Aplicar `web/sql/012_manual_tasks.sql` antes do deploy.

## Configurações em abas e etapas por cargo

As configurações são divididas em Regras e atribuição, Divisão comercial
(administradores) e Etapas da tarefa. A última aba lista Cargo, Etapa e Ordem da
etapa, com inclusão e edição na própria tabela e remoção por linha.
O cargo sugere os valores do cadastro de funcionários, mas aceita novos nomes.
A ordem vai de 1 a 9.999 e não pode se repetir dentro do mesmo cargo.
A migração `web/sql/025_task_stage_order.sql` garante essa exclusividade.
Não são permitidos nomes de etapa duplicados no mesmo cargo, ignorando maiúsculas.

A migração `web/sql/024_task_stages.sql` cria o cadastro com controle de versão,
RLS e auditoria em `web_access_events`. Somente administradores podem gravar;
usuários autenticados podem consultar. A interface atualiza imediatamente e
restaura a lista se a gravação falhar. Conflitos de edição exigem atualizar a lista.
Este cadastro prepara a futura visão Kanban por etapa; ainda não atribui etapas
às tarefas nem altera os status e fluxos existentes.

A ordem das etapas é somente leitura na tela. Arraste pelo ícone junto ao número
ou use as setas subir/descer para reposicionar uma etapa dentro do mesmo cargo.
A nova sequência é renumerada de 1 a N, aparece imediatamente e é salva em uma
transação; em caso de falha, a sequência anterior é restaurada. A migração
`web/sql/026_task_stage_reordering.sql` mantém a unicidade da ordem e permite
reorganizar o grupo atomicamente. A API confere as versões de todas as etapas
para não sobrescrever alterações concorrentes e registra a movimentação na auditoria.

Os campos de cargo e nome da etapa salvam automaticamente após uma pausa de
800 ms na digitação ou ao sair do campo. A inclusão também é automática quando
os campos obrigatórios estão preenchidos. Não há botão Salvar nas linhas;
a coluna Ações mantém a remoção. Durante a gravação a tela indica “Salvando…”.
Falhas restauram o cadastro anterior e exibem o erro.

## Etapa na tarefa

A migração `web/sql/027_task_stage_assignment.sql` vincula a tarefa a uma etapa.
No detalhe, abaixo da prioridade, o seletor mostra as etapas agrupadas por cargo
em ordem crescente. A seta avança à próxima etapa do mesmo cargo; fica inativa
quando nenhuma etapa foi escolhida ou quando a etapa atual é a última.
A escolha manual permite selecionar qualquer etapa cadastrada ou “Sem etapa”.

A mudança salva imediatamente em segundo plano, registra origem/destino e autor
nas notas e inicia o andamento de tarefas ainda não iniciadas. Não altera o
responsável e não conclui a tarefa ao chegar à última etapa. Tarefas concluídas
não permitem alterar a etapa. Versões concorrentes são rejeitadas e a interface
restaura o valor anterior em caso de falha. Etapas vinculadas a tarefas não podem
ser removidas do cadastro antes de trocar ou limpar esses vínculos.

Administradores podem excluir notas pelo ícone de lixeira no detalhe da tarefa,
após confirmação. A permissão é conferida no servidor dentro da transação;
usuários comuns não veem o botão nem podem executar a operação pela API.
A nota desaparece imediatamente e retorna em caso de erro. A exclusão mantém
uma cópia da nota e o autor da remoção na auditoria `web_access_events`, sem
alterar o status da tarefa nem desfazer o processo que originou a nota.

No Kanban, “Agrupar por → Etapa” exibe “Sem etapa” e as etapas cadastradas,
ordenadas pela sequência configurada. Os títulos exibem somente o nome da etapa;
o seletor “Cargo da etapa” permite mostrar um cargo ou todos.
Arrastar um cartão altera sua etapa com atualização otimista e registro nas notas;
tarefas concluídas não podem ser movimentadas. “Adicionar tarefa” dentro da
coluna já inclui a etapa inicial na criação, na mesma transação da tarefa.
