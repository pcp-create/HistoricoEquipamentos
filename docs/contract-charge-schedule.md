# Parcelas de contratos por competência

A sincronização comercial consulta a lista de contratos e, para **cada contrato e empresa**, pagina os dois endpoints M8:

- `GET /v1/contratos/contratoservico/{contratoId}/valorfixo`
- `GET /v1/contratos/contratoservico/{contratoId}/valorvariavel`

Os valores do cabeçalho não são divididos pelo prazo do contrato. As respostas completas das linhas e a programação mensal calculada ficam em `m8_commercial_facts.payload._billingSchedule` (versão 1). Ambas as consultas precisam concluir com sucesso antes de substituir o snapshot de contratos da empresa. Falha, interrupção, página repetida ou conteúdo inválido preserva os dados anteriores.

## Datas, valores e parcelas

- Valores fixos: recorrência mensal ou anual a partir de `inicioFaturamento`, usando `total` (que já incorpora a quantidade), sem multiplicar novamente pelo preço unitário. O valor numérico `0` da periodicidade corresponde a mensal; `1`, anual.
- Uma data de término intermediária, anterior ao fim do contrato, encerra a linha **antes** dessa data. Exemplo confirmado: instalação de 01/10/2026 até 01/12/2026 cobra outubro e novembro. O último mês do contrato permanece incluído quando o término da linha coincide com o término contratual.
- Valores variáveis: lançamento único no mês de `inicioFaturamento`; não se repetem nos demais meses.
- Linhas com a mesma competência são somadas, formando uma única linha na consulta de contratos. A parcela atual/total considera a sequência cronológica das competências com cobranças de todas as linhas; a linha mais longa determina a duração mensal quando não há intervalos.
- O contrato 81 tem R$ 8.000 em outubro e novembro (R$ 6.500 + R$ 1.500) e R$ 6.500 nos meses seguintes, por 36 competências.

A view `fContratos`, preservada para consultas e BI pela migration `024_contract_charge_schedule.sql`, usa a mesma programação. Snapshots antigos sem programação não voltam ao cálculo pelo cabeçalho: são sinalizados como coleta incompleta, bloqueando novas parciais até a atualização. Parciais já registradas continuam congeladas e não são reescritas.

## Faturamento

São consideradas notas processadas, não excluídas, emitidas na competência, com a mesma empresa e cliente. O valor pode corresponder ao total agregado ou a uma das cobranças individuais (e ao total das cobranças por cliente, quando a linha informa `clienteId`). Assim, notas separadas de R$ 6.500 e R$ 1.500 quitam os R$ 8.000 previstos do contrato 81. Uma nota é contabilizada uma única vez. Contratos repetidos em contextos de coleta diferentes são deduplicados por estabelecimento e ID.

A API de cabeçalhos de notas não oferece vínculo estruturado com o contrato. Quando empresa/cliente/valor correspondem a vários contratos, a nota fica no faturamento geral, sem atribuição automática a um contrato, e a tela informa a ambiguidade. Não se trata de confirmação de recebimento financeiro. Uma nota que reúne somente parte de várias linhas, sem corresponder a um valor reconhecido, também não é atribuída por suposição.

## Implantação

1. Atualizar o integrador e a aplicação web.
2. Executar `npm run db:migrate` (migration 024).
3. Executar a sincronização comercial para coletar as linhas fixas e variáveis nas três empresas.

Não executar uma versão antiga do integrador após a atualização: ela gravaria cabeçalhos sem a programação de cobranças. Nenhuma alteração é feita nos contratos ou notas do ERP.
