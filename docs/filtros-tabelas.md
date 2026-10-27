# Filtros encadeados nas tabelas

Clientes M8, Divisão Comercial e as tabelas de Vendas e Contratos compartilham o cálculo de opções em `web/lib/table-filter-values.ts`.

Ao abrir uma coluna, são considerados todos os filtros das outras colunas. A seleção da própria coluna não limita suas alternativas, permitindo trocar ou ampliar a seleção sem limpar os outros filtros. Valores vazios aparecem apenas quando existem nas linhas elegíveis. Selecionar tudo e o contador do menu consideram somente as opções disponíveis; Limpar filtro remove apenas o filtro dessa coluna.

Em Vendas e Contratos, as opções também respeitam empresa, situação, busca e seleção dos cartões. Nas planilhas editáveis, a mesma referência de dados usada na filtragem preserva a posição das linhas durante as alterações ainda não salvas.
