# Gestão de Oficina — primeira versão

Rota `/oficina`, módulo próprio na página inicial, antes de Configurações. Acesso para usuários autenticados. Painel, Kanban por etapa, filtros das três oficinas, lista de máquinas, consertos externos, saídas e conferência da planilha.

Migration web `067_workshop.sql` já aplicada no banco configurado nesta implementação. Não reaplicar diretamente: contém criação e carga das três oficinas. Em outro banco, aplicar uma vez, antes de publicar a interface. Não requer alteração no integrador M8.

Entrada registra equipamento existente, oficina, data/hora, previsão e observações; índice único impede duas entradas abertas para a mesma máquina. Saída preserva histórico e é bloqueada enquanto houver componentes externos sem retorno. Mudanças usam versão e bloqueio transacional. Datas exibidas em Brasília; tempo de permanência em dias corridos.

A indicação **Em Oficina** é derivada da entrada aberta na lista e no detalhe dos equipamentos, com precedência sobre a situação de locação. Não sobrescreve o cadastro M8 nem os ajustes de preventiva. Ao registrar saída, a situação original volta a ser exibida.

OSs são associadas pelos vínculos de equipamento do integrador ou produto_equipamento_id explícito. Tarefas abertas ligadas à máquina ou às suas OSs são reunidas, preservando a restrição de tarefas administrativas. Rascunhos de orçamento locais são associados por equipmentId. Orçamentos M8 não fornecem associação inequívoca à máquina no contrato consultado; o usuário seleciona o orçamento para vinculá-lo à entrada. Associação por cliente, sozinha, não é usada.

**Aguardando peça** é sinalizado automaticamente quando uma OS aberta vinculada apresenta falta/espera de peças ou materiais no status de lançamento. A etapa manual permanece registrada e volta a aparecer quando a pendência do ERP é resolvida. Nesta primeira versão, não se deduz falta apenas de estoque disponível zero: esse zero pode resultar do próprio empenho da OS. Outras etapas são controladas pela ficha da máquina; ampliar as regras de status e recebimento de peças fica para os próximos ajustes.

## Carga inicial da planilha

Arquivo privado `Manutenção Interna atualizada.xlsm`, lido sem executar macros e sem modificar o original. Três abas operacionais: 399 linhas de Equipamentos em Oficina, 207 de Equipamentos Locação em revisão e 165 de ENVIO A TERCEIROS. A aba de locação geral foi usada somente para relacionar código de frota e ID M8.

- Oficinas: RJ Compressores, RJ Serrana e Criciúma, normalizando as variantes dos nomes.
- Importadas 349 permanências e 56 envios a terceiros; 38 entradas abertas na primeira carga.
- 366 linhas aguardam conferência: identificação ausente/ambígua, datas incompletas, entradas abertas duplicadas ou envio sem entrada compatível.
- Todas as 771 linhas originais foram preservadas em web_workshop_imports, com aba, linha, valores e motivo da pendência. Datas, observações e situação original constam do documento de origem. Nenhuma data de saída foi inventada.
- Correspondências usam série exata no final do descritivo, OS com vínculo explícito/confirmado ou código da frota convertido pelo cadastro da própria planilha. Fontes divergentes permanecem pendentes.
- Consertos externos só entram quando há uma única permanência da máquina compatível com a data do envio. O vínculo não é inferido somente pelo cliente.
- Registros com data de saída ausente, mas situação encerrada, permanecem na conferência; não entram no contador de máquinas presentes.
- Importação repetida do mesmo arquivo não duplica registros. Conferido na base.

O CSV privado `artifacts/workshop-import-pendencias.csv` identifica as linhas para revisão. A interface de conferência é consultiva nesta primeira versão; a resolução dos vínculos pendentes será feita após confirmação dos equipamentos e datas. Os indicadores não representam as linhas ainda pendentes.

Ferramentas: `scripts/prepare-workshop-import.py` recebe JSON extraído do Excel e snapshot do catálogo/OSs; produz um plano revisável. `scripts/import-workshop.ts` recebe o plano, opera sem escrita por padrão e só importa com `--apply`, em transação com lock e trilha de auditoria. As entradas privadas e os relatórios não devem ir ao Git.

## Painéis gráficos

A aba inicial Painel mostra contagens por etapa atual e faixas de permanência (até 15, 16–30, 31–50 e mais de 50 dias). A lista ao lado ordena maior permanência primeiro e abre a ficha. Barras filtram a lista e respeitam oficina/pesquisa.

Consertos externos mostra quantidades por fornecedor, prazo de retorno (vencido, dentro do prazo, sem previsão) e faixas de tempo (até 7, 8–15, 16–30 e mais de 30 dias). Apenas envios sem retorno entram nos indicadores. Não há campo de etapa do serviço externo nesta versão; portanto não se infere aprovação/orçamento a partir da etapa da máquina. Prazos vencidos e ausência de previsão ficam destacados.

## Reconciliação da posição atual — 23/10/2026

A planilha filtrada `Equipamentos em oficina atual.xlsx` confirma 58 presenças (referência 22/10/2026, determinada pela concordância dos dias com as datas originais). Mantidas 22 entradas, incluídas 36 presenças sem vínculo ERP confirmado e retiradas 16 entradas importadas que não constam nessa posição. Nenhuma saída física foi presumida: `reconciled_out_at` retira a entrada dos indicadores e do status Em Oficina, preservando histórico, eventos e dados anteriores.

Migration `068_workshop_reconciliation.sql` aplicada na base configurada. Permite equipamento e oficina pendentes, adiciona reconciliação e separa orçamento comercial, garantias e devolução sem conserto. Entradas sem equipamento exibem descrição e cliente da planilha, sem associar OSs/tarefas por suposição. O registro novo BRF / KAESER CSD75 fica com oficina a confirmar; data calculada a partir da posição do relatório e explicitamente identificada na ficha.

A preparação e aplicação ficam nos scripts `prepare-workshop-reconciliation.py` e `reconcile-workshop.ts`. Plano, Excel e backup completo permanecem privados. Aplicação transacional, com auditoria, validação da contagem e identificação de lote para evitar repetição. Os registros retirados continuam acessíveis na aba Histórico.

## Posição atual de terceiros — 23/10/2026

`Equipamentos em conserto externo atual.xlsx`: 10 envios ativos, 8 aguardando aprovação e 2 aguardando orçamento. Dois já existiam; oito incluídos. Correspondência exata de cliente, componente e data de envio com a planilha original permitiu recuperar fornecedores: ATS (3), CONTTEC (2), GF MOTORES (2), ELEKTRA (1), LG MOTORES (1), METALPLAN (1). Quatro têm ficha de permanência vinculada, inclusive fichas fora da posição atual; seis permanecem sem vínculo presumido.

Migration 069 permite envio independente da permanência, preserva fonte, status, versão e reconciliação. API e painel contam envios sem retorno independentemente da presença atual da máquina. O gráfico agora usa status real do conserto; alertas de prazo permanecem separados. A ficha permite atualizar situação/previsão e registrar retorno, com controle de versão e histórico. Importação transacional e idempotente pelo script `reconcile-workshop-external.ts`, com backup privado anterior à alteração.

O usuário confirmou RJ Compressores para a entrada BRF / KAESER CSD75; local atualizado com evento de auditoria. A posição de oficina continua com 58 registros.

## Inclusão da frota em revisão — 23/10/2026

`Maquinas de Locação em Revisão na Oficina Atual.xlsx` complementa, e não substitui, a posição de clientes. Seus 17 registros foram cruzados por descrição e data com a aba `Equipamentos Locação em revisão` do XLSM original. Referência dos dias: 22/10/2026. Recuperadas 7 entradas retiradas na conferência anterior e incluídas 10; 13 vínculos ERP confirmados e 4 pendentes. Todas na RJ Compressores. Total atual: 75 permanências (58 anteriores + 17 da frota), sem alterar os 10 envios externos.

Mantidos estados reais do histórico, inclusive Serviço agendado e Aguardando descarte (o registro de descarte continua na posição ativa fornecida; não se presumiu saída). Migration 070 amplia os estados. Filtro Todas / Clientes / Frota de locação e identificação nas fichas/cartões. `reconcile-workshop-rentals.ts` valida quantidades, bloqueia saídas físicas já registradas, preserva auditoria e backup e evita duplicação pelo lote. Dados privados não versionados.

## Tempo acumulado por etapa

Lista e Kanban exibem o acumulado da etapa manual atual; a ficha detalha todas as etapas e o início do período corrente. Retornos à mesma etapa somam os períodos anteriores. Eventos novos guardam etapa anterior e próxima; o cálculo também reconhece eventos antigos de entrada, mudança manual, importação e conferência. Observações de importação contam somente a partir da data em que a situação foi registrada, sem retroagir à entrada. Períodos sem evidência ficam separados. Saída/reconciliação interrompe a contagem e salvar a mesma etapa não reinicia seu período. A indicação automática de falta de peças da OS continua separada das etapas manuais cronometradas, com explicação na ficha. Atualização visual a cada minuto.

### Valor envolvido por equipamento

O painel, a lista de equipamentos e os cards do Kanban exibem o valor das OSs **em aberto** vinculadas ao equipamento: status M8 `Pendente` ou `Aprovado`. Para equipamentos de clientes, soma `total_geral` das OSs com situação de Cobrança. Para a frota de locação, soma `total_geral` das OSs com situação de Custo (incluindo Custo de Locação); não utiliza a estimativa de lucro de materiais e mão de obra. A frota é identificada pela família 3 do cadastro M8 ou pela origem da planilha de locação.

A ficha detalha cada OS que participa do valor, com número, empresa, situação e link para o histórico. A soma respeita vínculos diretos ou complementares não obsoletos, deduplicados por equipamento, empresa e OS. Não inclui OSs processadas ou canceladas, nem presume vínculos pelo nome ou pelo cliente. Sem OS elegível, o total é zero; sem vínculo do equipamento ou com valor ausente/inválido em uma OS, apresenta “Não disponível” e o motivo, evitando exibir uma soma parcial como completa. Os valores acompanham a sincronização M8 e a atualização da oficina; não são congelados na entrada ou saída.

A aba **Produtos e serviços** da ficha consulta os itens somente quando aberta, nas mesmas OSs elegíveis do valor do equipamento. As subabas mostram produtos e serviços por OS/empresa, com descrição, referência, quantidade, unidade, valor unitário, total e situação. Itens excluídos ou reprovados permanecem visíveis e identificados, sem compor os subtotais. O total da OS permanece o informado pelo M8; diferenças em relação aos itens são apresentadas. Detalhes ainda não sincronizados geram aviso de relação possivelmente incompleta e não são tratados como subtotais zero.

O indicador **Valor parado em oficina** soma as OSs de Cobrança abertas dos equipamentos de clientes ainda presentes na oficina selecionada. Exclui frota, saídas e posições encerradas por reconciliação. Uma OS vinculada a vários equipamentos é contada uma vez por empresa/OS. Dados ausentes sinalizam o valor como parcial. O indicador acompanha o filtro da oficina, tal como a quantidade de Equipamentos de Clientes.

### Criar tarefas pela ficha

Em **Tarefas em aberto**, o botão **Criar tarefa** abre a seleção obrigatória entre tarefa normal e tarefa de aprovação, com título, responsável, prioridade, vencimento e descrição. Aprovações exigem responsável e descrição e seguem o fluxo existente de decisão e retorno ao solicitante. A atribuição usa as notificações existentes do módulo de tarefas.

O servidor resolve máquina, cliente e oficina a partir da entrada selecionada, sem aceitar substituição desses vínculos pelo navegador. A tarefa preserva a referência explícita à entrada na chave `manual:workshop:<entrada>:<identificador>`, além dos campos de máquina e cliente e do contexto no histórico. Isso permite localizar a tarefa na ficha mesmo quando a entrada importada ainda não tem código de equipamento. Entradas já encerradas não aceitam novas tarefas. O vínculo é validado e bloqueado para leitura dentro da transação de criação, evitando criar uma tarefa após uma saída concorrente. Nenhuma migração adicional é necessária.

### Resumo de atenção e conferência

O aviso de linhas pendentes e a aba Conferência foram removidos da interface. Os registros de importação continuam preservados no banco e nos instrumentos de auditoria; a consulta inicial do portal não carrega mais essa relação. O resumo **MÁQUINAS EM OFICINA • POR TEMPO / O que precisa de atenção hoje** ocupa o espaço acima das abas de visualização, com os filtros de oficina, origem e pesquisa. A lista e os gráficos permanecem no Painel; o resumo não se repete. O painel de terceiros mantém seu próprio resumo.

Não foram ativadas novas regras de prioridade. A análise inicial e as propostas para discussão estão em [Análise para priorização da oficina — 28/10/2026](oficina-prioridades-analise-2026-10-28.md).

### Justificativas e histórico de tarefas

Aprovar e reprovar exigem justificativa não vazia, de até 2.000 caracteres, validada no servidor. O botão abre o campo correspondente e a confirmação só é habilitada após o preenchimento. A decisão permanece visível na tarefa e retorna ao solicitante para tratativa, com notificação contendo o motivo.

Tarefas criadas pela ficha da oficina registram seus eventos na entrada explicitamente vinculada: criação, alterações de etapa/status, observações, decisão de aprovação/reprovação e encerramento da tratativa. O registro da tarefa e o evento da oficina compartilham a mesma transação. O histórico mostra data, autor, motivo e link para a tarefa; repetir uma decisão já registrada não duplica o evento. A etapa operacional da máquina não é alterada automaticamente. Eventos de tarefas atualmente restritas são ocultados de usuários sem perfil administrativo, preservando os detalhes confidenciais também no histórico da oficina.
