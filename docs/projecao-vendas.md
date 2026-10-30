# Comercial / Projeção de Vendas

Tela em `/comercial/projecao`, acessível pelo módulo anteriormente chamado CRM. O identificador `/modulos/crm` foi preservado para manter os links existentes; o nome visível é Comercial.

## Fontes e regras

- Fatos comerciais: `m8_commercial_facts`, somente registros presentes das empresas 1, 2 e 27404. Lista de notas deduplicada por ID, na ordem 1/2/27404, como no PBIX.
- Contratos: parcelas mensais inclusivas entre início e final. Correspondência de faturamento por cliente + valor da parcela + competência, conforme CHAVE_CONTRATO/TREATAS do modelo, sem inventar correspondência pelo nome.
- OS: `m8_ordens_servico`, uma versão por ID, priorizando a atualização mais recente. Categoria financeira COBRANÇA definida pela situação, conforme Power Query. Processadas entram pela data de faturamento; pendentes pela previsão, movendo meses vencidos para o mês atual de São Paulo. Canceladas e custos não participam.
- Faturamento outros = notas processadas − contratos faturados − OS faturadas, antes das devoluções. É uma diferença entre bases, portanto pode ser negativo; não é rotulado como exclusivamente PV.
- Devoluções: compras cujo tipo contém DEVOL e outros documentos das operações 30, 82, 90, 213, sempre Processado. Descontadas uma única vez do faturamento líquido.
- Projeção = faturamento líquido + OS pendentes + contratos previstos − contratos faturados.
- Metas mensais: extraídas da tabela dMetaFaturamento do PBIX, em `web/lib/sales-projection/targets.json`. Cobrem 2025/2026; outros períodos mostram meta não cadastrada. Metas são do grupo, sem divisão arbitrária por empresa.
- Atualizar recarrega a base integrada, sem realizar novas chamadas M8. Exportação CSV respeita o mês e a empresa selecionados. Detalhes mostram os documentos, pesquisa por palavras e links de OS.

## Conferência da imagem de outubro/2026

A imagem fornecida tem atualização de 26/10/2026 às 11:36:45. O PBIX enviado contém dados de faturamento somente até 22/09/2026; suas consultas/medidas foram usadas como regras, não como fonte dos fatos atuais de outubro.

O teste de regressão com os componentes da imagem reproduz:

| Indicador | Referência |
|---|---:|
| Contratos faturados | 218.507,74 |
| Vendas faturadas | 466.473,06 |
| Outros antes das devoluções | -2.399,98 |
| Devoluções | 1.805,25 |
| Outros na apresentação antiga (líquido) | -4.205,23 |
| Total faturado líquido | 680.775,57 |
| Total pendente | 536.566,96 |
| Total projeção | 1.217.342,53 |

Esses números de referência estão no teste, não são valores fixados na tela. Na consulta da base integrada durante o desenvolvimento, o líquido coincidia (680.775,57), mas a projeção era 1.222.873,75. Uma conferência adicional somente de leitura na API mostrou alterações nas OS 14728 e 15006 (processadas), 14762 (cancelada), 14830 (ausente), e mudanças de valores nas OS 13985, 14836 e 15119. A consulta M8 mais recente também já difere temporalmente da imagem. O painel não corrige valores artificialmente para reproduzir um fechamento passado: a reconciliação exige o mesmo instante de atualização das fontes. A rotina atual de OS deve resolver a defasagem; o painel não grava/exclui ordens.

## Validações

- Testes de cálculo: linha total da imagem, devoluções separadas, deduplicação, vencidos e exclusão de custos/cancelados.
- Navegador: filtros de período/empresa, abertura/fechamento de detalhes, pesquisa e largura móvel.
- Acesso ao endpoint exige autenticação; erros de infraestrutura não expõem dados internos.

## Acompanhamento comercial e edição em reunião

- O painel destaca **À buscar da meta**: meta menos projeção, limitado a zero quando a meta já está coberta. É diferente do saldo de vendas ainda não faturadas.
- `/comercial/contratos` apresenta empresa, código, cliente, tipo de contrato, parcela atual/total, valor da parcela, início/fim, faturado no mês e saldo. As colunas seguem a página de contratos do PBIX. O vínculo de faturamento usa cliente + valor da parcela + competência; não comprova recebimento financeiro. Contratos com chave repetida podem compartilhar a mesma nota, por isso seus valores vinculados não devem ser somados como faturamento global.
- `/comercial/vendas` reúne OS pendentes e faturadas, com competência, empresa, situação, busca textual e filtros/classificação nos menus das colunas. Inclui status e responsável do fluxo, previsão, modalidade, observação, equipamento, abertura, faturamento e vendedor. O vendedor prioriza o vínculo direto com o cliente e usa a divisão comercial como alternativa. O responsável do fluxo segue o mapeamento do PBIX.
- A lista exporta os registros filtrados e mantém as ações de edição visíveis durante a rolagem horizontal. OS faturadas são somente leitura. A previsão vencida continua deslocada para o mês atual, conforme o PBIX.
- **Editar** abre o editor de OS existente, com as validações de versão e confirmação do M8. Após concluir todas as etapas, consulta novamente o ERP e atualiza o registro local para recalcular a projeção. Retorna à lista mantendo competência, empresa e situação. Uma falha nessa consulta não repete a gravação: o retorno informa que a atualização local aguarda sincronização.

Validação: totais da referência, campos detalhados, mudança de mês após atualização confirmada, rejeição de resposta de outra OS, restrição de URL de retorno, filtros e edição somente nas pendentes, além de layout móvel.

## Conferência de faturamentos parciais

O painel e a lista de vendas mostram **Possível parcial**, valor de notas válidas identificadas, saldo a conferir e documentos de evidência. O filtro `billing=partial` exibe somente essas OS; clicar na conferência abre número/ID, emissão, valor, status e origem do vínculo de cada nota. O CSV inclui os mesmos dados. O retorno da edição preserva esse filtro.

A análise usa os snapshots já coletados pelo integrador, sem exigir uma nova versão. Considera todas as competências das notas, inclusive posteriores, para não apontar como pendente um complemento já emitido. A seleção das OS continua sendo a competência da projeção; portanto, esta é uma conferência **atual das OS daquele período**, não um fechamento fiscal histórico nem uma carteira completa de saldos de todos os meses.

Vínculos aceitos: `documentoFiscalId` da OS, quando é documento de venda (`tipoDocumentoFiscal=2`), e referência explícita e única `OS`/`O.S.` na observação da nota (ID ou número sequencial). Ambos exigem mesma empresa e cliente. Notas repetidas entre contextos de integração são deduplicadas. Referências a várias OS e colisões de números ficam para conferência, sem ratear o valor arbitrariamente. Valores acima do total da OS também exigem conferência. Sem nota identificada, o resultado é “Sem vínculo identificado”, não “Não faturado”.

Somente notas `Processado` e não excluídas compõem o valor identificado. Canceladas/excluídas aparecem como evidência quando ainda presentes no snapshot. A API não oferece no cabeçalho um vínculo estruturado de todas as notas de serviço à OS; tampouco o serviço da OS expõe os mesmos campos `faturado` e `saldo` disponíveis para produtos. Assim, referências em observação são indícios e não uma confirmação de saldo financeiro. Complementos sem referência, troca de cliente ou refaturamento por outra OS precisam de conferência no ERP.

Os totais originais da projeção e de “Faturamento outros” não são reclassificados automaticamente. O saldo sinalizado pode estar associado a cancelamento/refaturamento, e somá-lo sem validação poderia duplicar receita prevista. Uma consulta de leitura em 26/10/2026 identificou a OS 14897, total R$ 2.885,00, nota válida R$ 485,00 e nota ID 50099 cancelada de R$ 2.400,00 — exemplo de diferença que exige essa análise.

### Tipo do documento na conferência

A coluna **Tipo** consulta, ao abrir a janela, os endpoints de produtos e serviços de cada nota (`/v1/faturamento/notafiscalvenda/{id}/produto` e `/servico`). Exibe **Peças**, **Serviços**, **Peças e serviços** ou **Não identificado** (nenhum item ativo retornado). Não infere o tipo pela série, valor ou observação. A consulta autenticada valida empresa e existência da nota na base integrada; não modifica o documento, mesmo quando cancelado. Falhas aparecem como **Não disponível**, com opção de tentar novamente, sem alterar o saldo apresentado. Não requer atualização do integrador.

## Parciais e resumo gerencial

- `/comercial/resumo`: projeção, faturamento líquido, pendências, meta, valor a buscar (meta menos projeção, limitado a zero), percentuais, contratos pendentes e vendas pendentes por responsável do fluxo. Meta é do grupo; não é rateada arbitrariamente por empresa.
- `/comercial/parciais`: compara a integração atual com a parcial mais recente da mesma competência, permitindo escolher outra referência. Mostra entradas, saídas e alterações de valor, situação, datas, vendedor, responsável e saldo dos contratos.
- A captura manual por **Registrar parcial agora** permanece disponível e sempre captura as três empresas, independentemente do filtro visual. A [automação diária às 00h de Brasília](projection-daily-snapshots.md) registra o dia anterior e precisa ser ativada no n8n. Não há envio de mensagens.
- A captura consulta os dados no servidor, não aceita valores financeiros do navegador, guarda autor/horário/meta/documentos e bloqueia integração incompleta. A data da última integração aparece no resumo. O documento é imutável, inclusive por trigger no banco. Repetições da mesma requisição reutilizam o UUID para evitar duplicidade.
- **Parcial congelada** e **Imprimir / PDF** permitem compartilhar o resumo com os números gravados. A visão atual não altera fotografias anteriores.
- A comparação preserva identidade de OS ao faturar e identidade de nota ao mudar classificação. Uma saída significa ausência na competência, sem inferir cancelamento. A variação consolidada vem dos totais financeiros; não se somam linhas de documentos, porque OS, contratos e notas se compensam no modelo.
- Migração `020_sales_projection_snapshots.sql`, incluída em `npm run db:migrate`. Não registra automaticamente uma primeira parcial durante a implantação.
