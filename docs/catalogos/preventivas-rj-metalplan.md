# Preventivas Metalplan — Padrão RJ

Importação adicional das três planilhas fornecidas pelo usuário, preservando o catálogo ativo e todas as demais marcas/versões.

| Arquivo / linha | Modelos | Linhas na origem | Registros no catálogo |
| --- | --- | --- | --- |
| DD — 50 até 250 hp | TPF50DD, TPF60DD, TPF75DD, TPF100DD, TPF125DD, TPF150DD, TPF200DD, TPF250DD | 88 | 96 |
| TPF — 15 até 40 hp | TPF15, TPF25, TPF30, TPF40 | 41 | 43 |
| ROTOR 10 | ROTOR 10 | 19 | 19 |
| Total | 13 modelos | 148 | 158 |

As versões aparecem como **Metalplan · modelo · Preventiva — Padrão RJ**. A origem é um padrão interno RJ, não uma publicação oficial do fabricante. Não foram criados modelos intermediários sem aba própria.

## Tratamento dos dados

- As marcações X/x determinam as revisões previstas de cada linha. Listas como `4000 e 12000` permanecem listas exatas, com `interval_hours` vazio. Não foram convertidas em periodicidade de 4.000 h, o que incluiria incorretamente revisões não marcadas.
- O filtro de intervalo existente oferece essas listas textuais completas. Elas agrupam itens com a mesma programação; não representam automaticamente todos os materiais de uma única revisão numérica. As marcações originais de cada coluna também estão nas observações.
- As referências unidas por `+` foram separadas em dois registros, preservando o código do conjunto, a quantidade original do conjunto e a ressalva de que a quantidade individual não foi informada. Isso explica as 10 linhas adicionais no catálogo.
- Quantidades decimais, descrições, condições de aplicação, linha/aba/arquivo e preços históricos foram preservados. Não foram atualizados preços nem quantidades de orçamento no M8.
- As abas Preços são fontes auxiliares; não foram duplicadas como versões de peças. A data da tabela DD é 18/01/2023; TPF, 27/08/2021; ROTOR sem data informada. Valores calculados são os valores salvos nas planilhas, sem recálculo de fórmulas.
- Quatro referências com barra (`GHF1 - 20/40`, `GHF2 - 20/40`, `EF 0300/M40`, `EF 0300/M20`) permanecem no campo original, sem código automático de vínculo. Não foram substituídas por códigos parecidos.
- No ROTOR 10, os seis serviços sem código continuam visíveis e sem referência de produto inventada. O separador 3120234 após a série `57...` permanece sem quantidade e sem revisão marcada. As condições `até/após a série 57...` continuam nas descrições e estão sinalizadas para conferência, sem inferir uma faixa numérica de série.
- Na linha DD, o óleo 3020225 aparece como ECOBLUE em Preços e EXTRA nas abas de modelo. A divergência foi preservada como observação.
- A nota de revisão da unidade compressora/rolamentos a cada 20 mil horas permanece nas condições das versões. Só foram criados itens de serviço onde a planilha efetivamente contém uma linha correspondente (ROTOR 10).

## Arquivos de conferência e reprodução

Cada linha tem uma planilha padronizada com abas Itens/Instruções e um relatório JSON: `preventiva-rj-dd`, `preventiva-rj-tpf` e `preventiva-rj-rotor`. Os arquivos originais e a extração completa ficam arquivados em `.m8/manufacturer`, identificados por SHA-256.

Na pasta `web`, com `.env.local` configurado:

```bash
node --env-file=.env.local --conditions=react-server --import tsx scripts/import-rj-preventives.mts
node --env-file=.env.local --conditions=react-server --import tsx scripts/import-rj-preventives.mts --apply
```

Sem `--apply`, gera os arquivos padronizados e valida a situação das revisões sem escrever no banco. Com `--apply`, grava as três revisões adicionais na mesma transação e confere as contagens antes de confirmar. Repetir os mesmos arquivos não duplica dados. Uma planilha alterada deve ser revisada antes de uma nova importação, pois terá outro SHA-256.

A importação usa `report.managed=true`, sem substituir o catálogo original ativo. Não exige migration nem deploy para consultar os dados cadastrados. As planilhas de conferência não devem ser enviadas ao importador genérico de referências/periodicidades.

## Filtro de modelo

A consulta de conferência identificou que o filtro anterior aceitava TPF150DD ao selecionar TPF15. A correção em `manufacturer/rules.ts` usa igualdade do modelo (ignorando espaços) ou limites de palavra para nomes adicionais. Os testes de TPF15/TPF150DD, ROTOR10/ROTOR100 e PSV25AP passaram. Essa correção de código precisa acompanhar o próximo deploy; os registros importados já estão no banco e podem ser isolados pelo seletor de versão.
