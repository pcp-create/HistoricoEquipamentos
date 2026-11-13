# CRM comercial local

- `/orcamentos`: Histórico Orçamentos M8 (somente consulta dos dados sincronizados). Links salvos de orçamentos técnicos antigos continuam funcionando.
- `/crm`: cards e abas Leads, Clientes, Contatos, Oportunidades, Propostas e Pedidos (OSs); pesquisa e paginação de 30 registros.
- `/crm/propostas/{id}`: proposta local com o mesmo formulário de cabeçalho/produtos/serviços da OS.
- `/configuracoes/cadastros/crm`: tipos de oportunidades e propostas, situação ativa e IDs de tipos de OS configuráveis.

A migração `web/sql/108_crm.sql` cria as tabelas locais e carrega os 7 tipos de oportunidade e 13 tipos de proposta definidos em `Painel_Interativo_RJ_Compressores.html`. Os IDs existentes informados no HTML são vínculos iniciais editáveis. INS, STE e EME não recebem IDs inventados. Tipos de serviço e atendimento permanecem nos catálogos sincronizados do ERP. Os vínculos de atendimento do HTML são sugestões, não configurações confirmadas do M8; por isso não são impostos pelo CRM.

Uma oportunidade contém várias propostas. Empresa, cliente e tipo de oportunidade são definidos na oportunidade e não podem ser trocados depois de incluir propostas. Cada tipo de proposta pertence a um tipo de oportunidade e admite vários IDs de tipo de OS. Os cadastros locais não são enviados ao M8.

Propostas podem ser salvas incompletas, com controle de versão para evitar sobrescrita. A concretização exige todos os campos e regras da criação de OS, incluindo exigência de equipamento por tipo, vendedor e registros ativos. O usuário escolhe o tipo de OS entre os IDs vinculados. A empresa/cliente vêm da oportunidade, conferidos no servidor.

Na concretização, o CRM reserva um envio local e utiliza `prepareOrder`/`advanceOrder`, sem implementar outro cliente de gravação no ERP. Cada envio tem um UUID persistido, ator, snapshot da proposta e identificação da OS. A proposta fica bloqueada durante o envio, e só fica concretizada quando todas as etapas são confirmadas. Falha de validação antes de preparar o envio libera a proposta para correção. Resposta incerta não é reenviada automaticamente: a interface pede conferência no M8 e usa o mecanismo existente `retryOrder` com versão do andamento. Apenas quem iniciou o envio pode continuá-lo. Envio parcial preserva o ID e as etapas já confirmadas.

Uma proposta concretizada pode gerar outras OSs pelo botão explícito “Gerar outra OS”, escolhendo o tipo. A proposta pode ser editada localmente após a concretização; os snapshots dos envios e as OSs já geradas permanecem inalterados. Cada nova OS tem seu próprio envio. Esta etapa não implementa geração recorrente de OSs por contrato, nem presume aprovação comercial parcial por item.

Cards: total de oportunidades; total de propostas; OSs com ID confirmado (inclusive envio de itens ainda pendente); taxa = oportunidades distintas com pelo menos uma OS criada / total de oportunidades × 100. Várias OSs da mesma oportunidade contam uma vez no numerador. Sem oportunidades, a taxa é zero.

`crm_events` registra autor e data/hora dos cadastros, alterações e concretizações. A tela apresenta horários de Brasília. Tabelas locais têm RLS habilitado e acesso direto de anon/authenticated revogado; a API exige sessão autorizada e mesma origem para escrita.

Validação: testes com PostgreSQL em memória para migração/cadastros/vínculos/versões/conversão/falha incerta e testes de navegador com APIs simuladas para criação de proposta, salvamento local, concretização, configuração dos IDs e layout no celular. Os testes não criam OSs reais no M8.


## Edição e seleção de itens

A edição é acessada pelo hiperlink sublinhado no número da proposta, na lista e nos detalhes da oportunidade. Propostas concretizadas também podem ser editadas localmente, mantendo o status e os vínculos. Apenas envios de OS ainda pendentes bloqueiam a edição.

Depois do cabeçalho, as abas Produtos e Serviços reutilizam `QuoteItemRow`, `QuoteCatalogPicker`, `mergeQuoteItems` e `quoteHistory` do Novo Orçamento. É possível selecionar itens históricos, comparar preços de cadastro e últimas vendas, alterar quantidade/valor e preencher observações de serviços. Metadados do item do orçamento são persistidos no JSON local da proposta e removidos pelo `parseOrder` ao preparar a OS; não são campos enviados ao ERP.

A consulta autenticada `/api/quotes?action=history` usa o motor já existente. Quando há equipamento, limita-se ao equipamento e cliente. Sem equipamento, `historyScope=customer` permite consultar o histórico do cliente; o comportamento anterior do Novo Orçamento sem equipamento permanece inalterado. Só entram materiais não excluídos/não reprovados de OSs processadas com sincronismo concluído.


## Navegação e proposta comercial

O CRM segue os cards e a apresentação das listas de OSs. As seis abas têm listas independentes, pesquisa e paginação de 30 registros. Leads e contatos de leads respeitam a propriedade do cadastro ou o papel de gestor/admin; clientes são consolidados por pessoa M8 para evitar duplicidade por empresa. Os contatos usam as alterações locais existentes e podem ser editados com geração da tarefa padrão de ajuste manual. As listas de clientes e contatos consultam os cadastros disponíveis; não executam uma sincronização remota a cada troca de aba.

Oportunidades mostram fase, previsão de fechamento, valor estimado, probabilidade, responsável (autor da oportunidade), tipo e vínculos. A migração `116_crm_opportunity_pipeline.sql`, aplicada em 13/11/2026, adiciona os dados comerciais locais em JSON, sem criar oportunidades ou enviar dados ao ERP. As fases não alteram a taxa de conversão: só uma OS confirmada caracteriza uma oportunidade convertida.

Dentro da proposta, as abas são Cabeçalho, Produtos, Serviços e Resumo geral. Os dois editores de itens mantêm a seleção do histórico e do cadastro geral. `unitCost` representa o custo unitário local: produtos usam automaticamente o custo médio do cadastro na empresa da proposta; serviços permanecem com custo informado manualmente. Lucro bruto estimado = venda total − custo total; margem bruta = lucro / venda × 100. Custos em branco são desconhecidos, não zero. Havendo algum custo ausente, o lucro e a margem globais ficam indisponíveis. Venda zero não apresenta margem percentual. Valores negativos são permitidos para demonstrar prejuízo. Impostos e despesas adicionais não entram nessa estimativa.

O resumo exibe produtos e serviços separados, quantidades, valores unitários/totais, custos, lucro, margem e observações, inclusive as internas. Custo e condições comerciais ficam no JSON da proposta e são removidos pelo parser de OS antes do envio ao ERP. Propostas anteriores continuam editáveis sem custo preenchido.

## PDF da proposta

`GET /api/crm/pdf?id=<uuid>` exige autenticação e gera o PDF da versão salva. O modelo foi adaptado do Visualforce enviado: A4 horizontal, cabeçalho azul por empresa, dados do cliente/vendedor, equipamento, escopo, itens, condições comerciais, subtotais, total, assinatura e unidades. Mantém também o rodapé padrão GW/WhatsApp. O primeiro vídeo fornecido estava vazio; o segundo foi utilizado como referência visual do CRM.

Custos, lucros, margens e observações internas não são incluídos no PDF comercial. Os campos fiscais do modelo que ainda não têm valores definidos no CRM aparecem como traços; IPI é identificado como não informado, sem presumir uma alíquota zero. O total corresponde à soma dos itens, sem calcular tributos não informados. O botão exige salvar as alterações antes de emitir o documento atualizado.

Campos adicionais do cabeçalho permitem informar contato, telefone, validade, e-mail/telefone do vendedor e transportadora. Condição de pagamento, vendedor e frete aproveitam as descrições selecionadas no formulário.


## Custo médio dos produtos

A leitura e o salvamento de propostas consultam o custo médio em `m8_product_stock` usando a mesma regra consolidada do catálogo: custos iguais são mantidos; custos diferentes são ponderados pelo estoque quando todos os saldos são conhecidos, não negativos e a soma é positiva. Custos ausentes ou inconclusivos não são tratados como zero. A consulta considera somente a empresa da oportunidade, sem aproveitar custo de outra empresa.

A interface consulta os custos em lote ao incluir produtos e permite atualizar os custos médios. O campo dos produtos é automático e somente leitura. Ao salvar, o servidor resolve o custo novamente, ignorando substituições manuais dos produtos. Valores de custo médio mantêm até seis casas decimais; o custo total é arredondado em centavos após multiplicar pela quantidade. Serviços mantêm seu custo manual. Quando a unidade informada difere do cadastro, o custo fica indisponível e a tela orienta conferir a unidade; não há conversão automática.

Nenhum custo ou margem é enviado ao M8 ou impresso no PDF comercial. O custo é registrado no JSON local ao salvar, com origem e data do estoque consultado; ao abrir a proposta os valores médios disponíveis são consultados novamente.


No cabeçalho da proposta, o campo **Tipo de proposta** usa o cadastro local do CRM, filtrado pelo tipo da oportunidade. A edição salva `crm_proposals.type_id` com controle de versão e validação de compatibilidade. O tipo de OS permanece separado em **Tipo de OS a gerar**, usado na concretização. Quando o novo tipo de proposta não admite o tipo de OS selecionado, essa seleção é limpa; OSs já criadas permanecem vinculadas sem alteração.


## Desconto por item no resumo

A coluna **Desconto (%)** do Resumo geral permite definir de 0 a 100%, com até duas casas decimais, separadamente para cada produto e serviço. O campo em branco equivale a zero. O percentual é salvo no JSON do item, preservando o preço unitário original. A alteração atualiza subtotais, total líquido, lucro e margem; custos não são reduzidos pelo desconto.

O preço unitário líquido é arredondado em centavos antes de multiplicar pela quantidade, usando a mesma regra na tela, no total salvo, no PDF e no pedido enviado ao M8. O PDF apresenta o preço líquido e identifica o percentual na descrição. Na concretização, a requisição ERP recebe somente o preço líquido; o snapshot local preserva preço base e percentual. O reprocessamento usa o mesmo valor líquido sem aplicar o desconto novamente. OSs anteriormente geradas permanecem inalteradas.
