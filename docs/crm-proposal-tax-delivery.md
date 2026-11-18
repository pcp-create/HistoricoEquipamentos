# Impostos e entrega dos produtos da proposta

A proposta armazena `commercial.taxBudgetType` (ID do tipo de orçamento do M8, não o ID do tipo de OS) e `commercial.deliveryDays` (0–9999 dias úteis). O vendedor seleciona o tipo fiscal em Produtos ou Resumo geral, a partir de `GET /v1/crm/tipoorcamento?Ativo=true&PageSize=1000`.

`POST /v1/crm/impostosimular` recebe clienteId, tipoOrcamentoId e itens com produtoId, quantidade e valorUnitario líquido do desconto. Empresa é definida na autenticação M8. A resposta documentada contém valores monetários de ICMS, ICMS ST, IPI, PIS e COFINS; não contém alíquotas nem bases de cálculo. Não inferimos percentuais nem somamos tributos ao preço líquido automaticamente. Os totais e margens preservam a regra comercial existente, e os impostos são demonstrados separadamente.

A consulta não cria orçamento ou OS no ERP. Na tela, o botão Calcular impostos usa o rascunho atual. Alterações de empresa, cliente, tipo fiscal, produto, quantidade ou preço líquido invalidam a exibição dos valores anteriores. Salvar a proposta e gerar o PDF recalculam no servidor quando há tipo fiscal selecionado. Falhas ou produtos ausentes na resposta não viram imposto zero. Os cálculos enviados pelo navegador são descartados ao salvar. Produtos repetidos são separados em chamadas para não confundir resultados: a resposta identifica somente produtoId.

Estoque disponível é consultado em `m8_product_current` pela empresa e produto, a mesma fonte usada na análise de materiais. A data da coleta é exibida, pois não se trata de uma reserva nem de estoque em tempo real. Unidade divergente ou saldo ausente não permitem prometer entrega imediata.

O prazo automático considera a quantidade total do código na proposta: saldo suficiente resulta em Imediato; saldo insuficiente ou desconhecido utiliza deliveryDays. Sem prazo configurado, mostra Prazo não informado. `item.deliveryLeadTime` permite sobrescrever inclusive Imediato; apagar o campo restaura a regra automática. Prazo e impostos constam no PDF. O PDF reconsulta estoque antes de aplicar a regra e preserva a alteração manual.

Referência: https://api.integra.m8sistemas.com.br/docs/index.html#tag/CRM-Orcamentos/operation/ErpM8CrmImpostoSimularPost
