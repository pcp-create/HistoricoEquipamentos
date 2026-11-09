# Gráfico de Evolução do faturamento

Acesso: Comercial → Gráfico de Evolução, em /comercial/evolucao. Disponível para usuários autenticados. O relatório é somente leitura.

## Tela

Filtros por empresa (RJ Indústria, RJ Serrana, Criciúma e grupo), anos e meses. Gráficos anuais e mensais, indicadores, comparativo mensal com variação e participação das empresas. A tabela exibe todos os meses sem rolagem vertical interna e permite exportação CSV do período selecionado.

Os percentuais anuais comparam somente meses presentes nos dois anos. Não se compara um ano incompleto com o total de doze meses do anterior. Ausência de histórico é exibida como “—”, nunca como zero. O mês corrente é parcial.

## Dados

O histórico estático foi extraído das quatro abas de faturamento/resumo de “Evolução de Faturamento do Grupo.xls”. O arquivo lib/billing-evolution/history.json registra a origem, SHA-256 e os 36 resumos anuais, com valores mensais quando disponíveis. Reimportação: a partir de web, executar node scripts/import-billing-evolution.mjs.

RJ em 2010 e 2011 possui somente totais e médias anuais. Não há distribuição mensal estimada. Serrana inicia em abril de 2019 e Criciúma em julho de 2024. O consolidado de 2019 da planilha começa em abril; a participação respeita os meses disponíveis nesse consolidado.

Quando existe faturamento no sistema para empresa/mês, ele substitui o valor estático do mesmo mês. Demais lacunas preservam a planilha. Meses consolidados com integração somam os valores disponíveis das empresas. Sem integração no mês, preserva-se o consolidado original da planilha. A origem de cada célula é identificada por cor e descrição; meses integrados com histórico incompleto em alguma empresa recebem asterisco.

Integração: m8_commercial_facts, registros presentes, status Processado e não excluídos. Faturamento líquido = totalGeral de fFaturamento menos devoluções elegíveis, pelo mês de emissao. Segue os critérios do Comercial: fDevolucoesCompra com tipoCompraDescricao contendo DEVOL e fDevolucoesOutros com outrosDocumentosOperacaoId em 30, 82, 90, 213 ou 280. Deduplicação global por espécie e id, com preferência pelo contexto de menor company_id; empresa efetiva pelo payload.empresaId quando reconhecido. Não soma projeções de OS ou contratos. Meses contendo apenas devoluções são incluídos com líquido negativo. O histórico da planilha permanece com seus valores originais; não se presume uma composição bruta ou líquida que não está disponível.

Dados financeiros estáticos são importados somente no servidor. A API /api/billing-evolution exige autenticação e responde sem cache compartilhado. Falha da integração exibe aviso e apenas os dados estáticos. Não há migração nem escrita no ERP.

## Validação

Testes de reconciliação da planilha, prioridades de fontes, ausência de dados, meses futuros e crescimento comparável. Teste de navegador cobre filtros, troca de gráfico, exportação e layout móvel. Conferência da consulta real ao banco realizada somente em leitura.

A tabela aparece antes do gráfico, com linhas compactas e sem limite de altura/rolagem vertical interna. Destaques: azul para maior valor de cada mês entre os anos exibidos; verde para maior mês de cada ano no período selecionado; dourado para maior valor mensal de toda a base da empresa selecionada, incluindo anos fora do filtro. Empates são destacados. Se uma célula acumula critérios, prevalece dourado, depois verde; a descrição da célula informa todos os critérios. Totais anuais sem distribuição mensal não participam dos recordes mensais.

Ao clicar em um valor mensal ou no total anual da tabela, uma janela exibe faturamento total, devoluções, líquido e valor na evolução, separados por empresa. A composição do período só é somada quando todos os meses com valores possuem a composição integrada. Dados históricos sem essa composição aparecem como indisponíveis, nunca como devoluções zeradas. A janela pode ser fechada por botão, Escape ou clique fora dela. Consulta real de outubro/2026 reconciliada com a projeção do Comercial nas três empresas.

O gráfico anual permite selecionar um ano pela barra ou pelo rótulo (também com Enter/Espaço). A seleção fica azul no gráfico e no cabeçalho da tabela e atualiza exclusivamente os valores e título da participação das empresas. O cabeçalho da tabela também permite selecionar o ano. O padrão é o último ano com valores disponíveis; anos vazios gerados pelo calendário não avançam a seleção inicial. Filtros que removem o ano selecionado fazem a participação acompanhar o último ano disponível no recorte.
