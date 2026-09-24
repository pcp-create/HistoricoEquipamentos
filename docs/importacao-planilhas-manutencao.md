# Importação das planilhas de manutenção — 24/09/2026

Fontes privadas: `Tabela Controle Manutenções - GRUPO RJ.xlsx` e
`Tabela Controle Manutenções - Serrana - Criciuma Compressores.xlsx`.
Os arquivos originais e os relatórios não devem ser publicados no GitHub.

O preparo em `scripts/prepare_spreadsheet_preventives.py` usa a exportação JSON
por aba do pacote xlsx e uma fotografia do cadastro, planos e vínculos com clientes.
Os artefatos estão em `.m8/spreadsheet-preventives/`, incluindo hashes das fontes.
A série é comparada por inteiro, normalizando pontuação e espaços. Séries repetidas
só são desambiguadas por vínculo explícito com o cliente cadastrado. O campo ID M8
das planilhas representa o cliente, não é usado como ID do equipamento.

Abas perdidos/removidos e transição/inativos foram inventariadas, mas não reativadas.
Duplicidades entre arquivos são agrupadas por equipamento e intervalo. A data de
próxima manutenção e o status da planilha não comprovam execução. Datas futuras,
intervalos não identificados e horímetros sem data ficam em pendências. Notas que
indicam execução futura nos contratos não preenchem última intervenção.

Regras anteriores preservadas: 2.000 h/6 meses, 4.000 h/12 meses, 8.000 h/24 meses,
20.000 h ou mais/60 meses; outros intervalos em horas não recebem meses inventados.
Planos apenas por meses usam o intervalo explicitamente informado, ou periodicidade
inteira quando não há intervalo textual. Revisões maiores atualizam os planos
menores existentes, preservando intervenções posteriores e horímetros divergentes.
OS é vinculada apenas quando número, equipamento e data conferem com a base;
números de orçamento não são tratados como OS. Materiais dos planos são preservados.

Leituras reais usam as datas explícitas junto ao HT ou a última manutenção nas
linhas de contratos que descrevem a leitura daquela intervenção. Também são
consideradas leituras das intervenções já cadastradas e a penúltima leitura Iliot
quando sua última leitura corresponde à leitura atual validada do equipamento.
A média usa as duas datas mais recentes; conflitos na mesma data, redução e taxa
acima de 24 horas/dia não geram estimativa. Rotinas explícitas são preservadas;
campos vazios recebem o padrão autorizado 24 h/dia e 365 dias/ano. Rotinas ainda
marcadas com padrão autorizado podem ser substituídas por média válida, em base
calendário de 365 dias (não comprova jornada). Locação não recebe média por dias
corridos, evitando descontar a inatividade duas vezes.

`web/scripts/import-spreadsheet-preventives.mts` simula por padrão. `--apply` grava
em transação, com bloqueio, conferência de versões e série atual, antes/depois e
origem por aba/linha nos eventos. O arquivo do lote permite auditoria e recuperação.
Não reexecute usando a fotografia antiga: exporte novamente o cadastro antes de
uma nova análise. O processo não escreve nas planilhas nem nos sistemas paralelos.

## Resultado aplicado

Lote `dbb2370e-74cc-4e1a-a602-c1352999bd4f`: 499 linhas vinculadas a 402
 equipamentos. Alterações em 366 equipamentos: 340 planos criados, 56 planos
atualizados e 116 configurações operacionais complementadas. Nesse conjunto,
91 datas/leituras reais foram preenchidas ou atualizadas a partir do cruzamento
com o histórico existente, e 39 médias de horas por dia foram atualizadas.
Foram preservadas 148 ocorrências de pendência (não representam equipamentos
únicos) e 258 linhas de controles inativos/removidos para revisão.

Relatórios privados: `alteracoes.csv`, `pendencias.csv`, `excluidos.csv`,
`summary.json` e `import-<lote>.json` em `.m8/spreadsheet-preventives/`.
