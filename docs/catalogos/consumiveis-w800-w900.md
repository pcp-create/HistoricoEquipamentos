# Consumíveis W800 e W900

Importado no Supabase em 14/09/2026 como catálogo adicional, preservando as demais marcas e versões.

- W800: 46 itens.
- W900: 52 itens.
- Aplicação por modelo/padrão construtivo Wayne, sem restrição de série.
- Os 97 itens com código interno possuem correspondência na base M8. O cárter W800 permanece sem vínculo (código X na origem).
- Quantidades, posições da vista, observações e valores da coluna “Percentual venda (médio)” foram preservados. Não foi aplicada fórmula de preço a partir dessa coluna.
- Não há intervalo de manutenção informado. Para ver a lista completa, deixe o intervalo em branco.
- A fonte é uma relação interna de consumíveis padronizados. Não comprova que os produtos indicados sejam genuínos Wayne nem que todos precisem ser substituídos simultaneamente.
- As ressalvas técnicas e alternativas (medidas, cubos novos/antigos etc.) permanecem nas observações. A quantidade de três tampas BP no W800 foi preservada como está na planilha; conferir tecnicamente antes do orçamento, pois a introdução descreve dois cilindros BP.

A planilha padronizada está em `consumiveis-w800-w900.xlsx`, com uma aba Itens e outra Instruções. O arquivo original não foi alterado; ilustrações permanecem no original. Essa planilha usa códigos internos e não deve ser enviada ao importador genérico que exige referências genuínas e intervalos.

## Reproduzir a importação

Na pasta `web`, com `.env.local` configurado:

```bash
node --env-file=.env.local --conditions=react-server --import tsx scripts/import-piston-consumables.mts '../RELAÇÃO CONSUMÍVEIS - W800 E W900.xlsx'
```

Acrescente `--apply` para gravar. Sem essa opção, apenas gera os arquivos padronizados e confere os códigos. Repetir o mesmo arquivo não duplica registros. Arquivos alterados geram outra revisão adicional; não usar para substituir uma importação anterior sem revisar a duplicidade de versões.

Os vínculos diretos usam o prefixo `M8:` no catálogo e são resolvidos pelo ID do produto, em todas as empresas. Não são gravados como referências genuínas nem dependem do índice de similaridade que o integrador atualiza.

Os ajustes de consulta e apresentação precisam acompanhar o próximo deploy do site. Não há migration nem atualização do integrador para esta importação.
