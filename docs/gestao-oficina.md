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
