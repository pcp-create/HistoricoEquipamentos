# Análise do Projeção de Vendas.pbix

Extração local em 26/10/2026. Foram lidas consultas Power Query, expressões auxiliares, esquema do modelo e 59 medidas DAX. O Power BI Desktop e as medidas não foram executados. Nenhum dado ou arquivo foi enviado a um serviço externo para análise. A biblioteca usada foi [PBIXRay](https://github.com/Hugoberry/pbixray).

## Origens e regras confirmadas

| Tabela | GET M8 | Regra do PBIX |
|---|---|---|
| fContratos | /v1/contratos/contratoservico | Todos os contratos, expansão mensal de início até final inclusive; valor dividido pelo número de meses. Sem filtro de ativo/cancelado. |
| fFaturamento | /v1/faturamento/notafiscalvenda | Status Processado; remoção de duplicatas por ID após união das empresas; emissão em data e mês/ano. |
| fDevolucoesOutros | /v1/faturamento/notafiscaloutra | Status Processado e outrosDocumentosOperacaoId em 30, 82, 90, 213. |
| fDevolucoesCompra | /v1/compras/notafiscal | Status Processado e tipoCompraDescricao contém DEVOL (sensível a maiúsculas, como no Power Query). |

As quatro origens do PBIX incluem 1, 2, 24571 e 27404. A pedido do usuário, a nova rotina usa **somente 1, 2 e 27404**. Portanto, os totais não devem ser comparados com o PBIX incluindo 24571.

## Armazenamento e diferenças deliberadas

- Preserva todas as propriedades de cada resposta no payload JSON, sem limitar aos campos expandidos no PBIX. As views também expõem as colunas do modelo individualmente.
- Mantém documentos de todos os status na origem; os filtros são aplicados nas views. Isso permite que um documento antes processado deixe de participar após cancelamento.
- Mantém a chave empresa/tipo/ID no armazenamento. A view fFaturamento reproduz a deduplicação por ID do PBIX, escolhendo deterministicamente a empresa 1, depois 2, depois 27404. As outras três não deduplicam entre empresas, como na consulta original. É possível revisar essa regra sem perder as origens.
- Não acrescenta filtro estaExcluido nem ativo/cancelado que não exista nas consultas originais. Os campos continuam disponíveis para conferência e regras futuras.
- Datas representam o dia informado no texto da API, sem converter a emissão para outro fuso antes de extrair a data. Valores monetários são numeric no PostgreSQL.
- Contratos sem início/final ou sem meses válidos não geram competências. O tipo de contrato vem do texto após o primeiro “ - ”; quando ausente, a view retorna null.
- Consultas originais usam Page=0/PageSize=0 e capturam erros como lista vazia. A rotina nova usa paginação e valida os erros: falhas não removem dados válidos anteriores.
- As 59 medidas DAX foram identificadas, mas não são necessárias para a ingestão das quatro fontes; não foram convertidas em indicadores da interface nesta entrega.

## Colunas do modelo

### fContratos (49 colunas)

`id`, `descricao`, `tipoContratoId`, `tipoContratoNome`, `estabelecimentoId`, `estabelecimentoNome`, `pessoaId`, `pessoaNome`, `condicaoPagamentoId`, `condicaoPagamentoNome`, `slaId`, `slaNome`, `projetoId`, `projetoNome`, `municipioPrestacaoId`, `municipioPrestacaoNome`, `emissao`, `inicioFaturamento`, `inicio`, `final`, `valor`, `bancoHoras`, `dataBancoHoras`, `valorHora`, `totalHorasValor`, `periodicidadeHora`, `reajusteAutomatico`, `descontoAdimplencia`, `cancelado`, `canceladoFiltro`, `dataCancelamento`, `motivoCancelamento`, `moedaId`, `moedaNome`, `periodicidade`, `observacoesNF`, `objeto`, `observacoes`, `ativo`, `Parcelas`, `Valor Parcela`, `Competência`, `Parcela do Mês`, `Parcela Atual/Total`, `Mês/Ano Competência`, `Tipo de Contrato`, `Contrato`, `CHAVE_CONTRATO`, `Última Parcela?`.

### fFaturamento (38 colunas)

`id`, `empresaGrupoNome`, `pessoaId`, `pessoaCnpj`, `pessoaNome`, `pessoaRazaoSocial`, `empresaId`, `empresaNome`, `empresaFantasia`, `emissao`, `serieDocumentoId`, `serieDocumentoNome`, `status`, `documento`, `chaveNfe`, `documentoNfe`, `descricaoStatusNfe`, `documentoNFP`, `statusNfe`, `tipoDocumento`, `outrosDocumentosOperacaoId`, `totalGeral`, `estaExcluido`, `outrosDocumentosOperacaoNome`, `montagemCargaNome`, `observacao`, `projetoExecucaoId`, `projetoExecucaoNome`, `grupoEconomicoId`, `grupoEconomicoNome`, `projetoExecucaoNumeroProposta`, `condicaoPagamentoNome`, `atualizadoPeloUsuarioId`, `excluidoPeloUsuarioId`, `usuarioCadastrouId`, `Contrato`, `Mes/ano Emissao`, `CHAVE_CONTRATO`.

### fDevolucoesOutros (59 colunas)

`id`, `empresaGrupoNome`, `pessoaId`, `pessoaCnpj`, `pessoaNome`, `pessoaRazaoSocial`, `empresaId`, `empresaNome`, `empresaFantasia`, `emissao`, `serieDocumentoId`, `serieDocumentoNome`, `status`, `documento`, `chaveNfe`, `documentoNfe`, `descricaoStatusNfe`, `documentoNFP`, `statusNfe`, `tipoDocumento`, `outrosDocumentosOperacaoId`, `totalGeral`, `estaExcluido`, `outrosDocumentosOperacaoNome`, `montagemCargaNome`, `observacao`, `projetoExecucaoId`, `projetoExecucaoNome`, `grupoEconomicoId`, `grupoEconomicoNome`, `projetoExecucaoNumeroProposta`, `condicaoPagamentoNome`, `atualizadoPeloUsuarioId`, `excluidoPeloUsuarioId`, `lancamento`, `dataEntrada`, `fornecedorCnpj`, `fornecedorRazaoSocial`, `fornecedorFantasia`, `transportadorId`, `transportadorNome`, `participanteId`, `participanteNome`, `tipoCompraId`, `tipoCompraDescricao`, `imovelRuralId`, `imovelRuralNome`, `unidadeNegocioId`, `unidadeNegocioNome`, `freteId`, `freteNome`, `valorFrete`, `valorFreteAPagar`, `outroDocumentoId`, `statusMarkup`, `usuarioCadastrouId`, `codigoIndentificacaoInternoGrupoNF`, `nomeProdutoGrupoNF`, `referenciaFabricanteGrupoNF`.

### fDevolucoesCompra (42 colunas)

`id`, `emissao`, `lancamento`, `dataEntrada`, `pessoaId`, `fornecedorCnpj`, `pessoaNome`, `fornecedorRazaoSocial`, `fornecedorFantasia`, `empresaId`, `empresaFantasia`, `empresaNome`, `empresaGrupoNome`, `transportadorId`, `transportadorNome`, `participanteId`, `participanteNome`, `tipoCompraId`, `tipoCompraDescricao`, `imovelRuralId`, `imovelRuralNome`, `unidadeNegocioId`, `unidadeNegocioNome`, `freteId`, `freteNome`, `valorFrete`, `valorFreteAPagar`, `documento`, `observacao`, `outroDocumentoId`, `status`, `statusMarkup`, `estaExcluido`, `usuarioCadastrouId`, `atualizadoPeloUsuarioId`, `excluidoPeloUsuarioId`, `totalGeral`, `chaveNfe`, `codigoIndentificacaoInternoGrupoNF`, `nomeProdutoGrupoNF`, `referenciaFabricanteGrupoNF`, `condicaoPagamentoNome`.
