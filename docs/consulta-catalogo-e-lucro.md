# Catálogo e estimativa de lucro da OS

Na consulta de histórico, a situação (`situacao_nome`) aparece abaixo do número da OS no lugar do ID. Se estiver ausente, a tela informa isso.

O catálogo do fabricante reúne as três empresas, sem seletor de empresa. Links antigos com empresa são normalizados pela tela. A série permite consultar o consumo agregado das empresas 1, 2 e 27404.

**Filtrar itens da lista** pesquisa enquanto se digita, ignorando acentos e maiúsculas. O filtro é aplicado no navegador aos itens já carregados da página atual, incluindo descrições, códigos e referências dos produtos vinculados. Digitar não faz novas chamadas à API; o contador informa quantos itens da página estão visíveis. A pesquisa global e a paginação continuam consultando o servidor. A pesquisa global também aceita o código interno M8 para encontrar entradas relacionadas por referência fabricante ou similaridade. Cada card de produto exibe a referência fabricante abaixo do ID.

## Lucro bruto estimado

A simulação no detalhe da OS calcula:

- Custo dos materiais: quantidade aplicada × custo médio atual M8 (`valorCustoMedioAtual`, já coletado em `m8_product_stock.average_cost`), na empresa da OS e na mesma unidade. Itens excluídos não entram.
- Quando os estabelecimentos têm custos iguais, usa esse custo mesmo com saldo zero. Quando diferem, usa média ponderada pelos saldos não negativos e com total positivo; dados ausentes ou incompatíveis exigem informar o custo total manualmente.
- Mão de obra: **R$ 40,00 por hora**, conforme regra da empresa. Quantidades são somadas automaticamente apenas se todos os serviços não excluídos tiverem unidade em horas no cadastro M8. Caso contrário, o usuário informa o total de horas. Horas podem ser ajustadas para a simulação.
- Lucro bruto estimado: total da OS menos custos dos materiais e mão de obra. Margem: lucro dividido pelo valor total da OS; receita zero não gera percentual.

O custo médio atual não representa necessariamente o custo na data da venda. Impostos, despesas e outros custos não informados não são deduzidos. O cálculo não altera o ERP. O botão Calcular e salvar grava o resultado, os custos, as horas, o valor da OS utilizado, a data e o usuário responsável no Supabase. Valores ausentes não são tratados como zero.

O salvamento exige a migration web 006_order_profit.sql, aplicada por npm run db:search na pasta web. Depende da coleta de estoque já existente e do cadastro de serviços da migration 010 para reconhecer unidades de mão de obra.

## Aprovação dos materiais

O contrato M8 expõe `aprovado` como `BoleanoEnum`; os dados da OS 14611 retornam `Sim` e `Nao`, já preservados pelo integrador. A aplicação reconhece também `false` booleano/textual e `Não`. Ausência do campo não é interpretada como rejeição.

Materiais não aprovados ficam visíveis em amarelo e não participam dos totais, custos estimados, consumo, últimas vendas ou referências de venda nos orçamentos. Itens excluídos têm prioridade visual em vermelho. Não é necessária nova migration ou atualização do integrador para essa regra.

Verificação da OS 14611: três materiais não aprovados de R$ 466,80 representam R$ 1.400,40; materiais aprovados e não excluídos totalizam R$ 1.867,20, conciliando com o total informado pelo ERP.


A seção fica recolhida por padrão. **Calcular lucro da OS** abre os campos; **Calcular e salvar** persiste a estimativa. Depois, **Já calculado** informa a data e **Ver lucro calculado** abre o resultado salvo. **Recalcular lucro da OS** permite confirmar novos custos e horas e substituir o resultado. O valor da venda é lido no servidor, não aceito do navegador. A versão impede sobrescrever silenciosamente o cálculo de outro usuário. A tabela tem RLS e bloqueia acesso público.
