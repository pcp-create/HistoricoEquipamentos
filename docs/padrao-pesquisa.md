# Pesquisa textual

As pesquisas livres exigem todas as palavras digitadas, independentemente da ordem. `FILTRO AR` e `AR FILTRO` encontram `FILTRO DE AR`; `FILTRO ÓLEO` não encontra esse produto. Espaços repetidos não criam termos vazios.

- Filtros em memória e seletores: `matchesSearch(texto, consulta)` em `web/lib/filters.ts`. Ignora caixa e acentos.
- PostgreSQL: `searchPatterns(consulta)` retorna uma lista de padrões literais para parâmetros de `LIKE ALL($n::text[])` ou `ILIKE ALL($n::text[])`. A normalização de acentos dos campos SQL segue a configuração de cada consulta. Aplicar o filtro antes de paginar.
- Consultas de histórico com condições em diferentes tabelas mantêm uma condição por palavra, agrupando os ORs dentro de cada palavra.
- Filtros exatos de IDs, empresas, situação, datas e permissões preservam suas regras.
- Não interpolar termos fornecidos pelo usuário no SQL. `%`, `_` e barras são escapados como texto literal.
