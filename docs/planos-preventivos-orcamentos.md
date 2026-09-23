# Materiais do plano preventivo e orçamento

1. Abra **Equipamentos → Gerenciar → Editar plano** (ou crie um plano).
2. Em **Materiais e serviços da preventiva**, confira as **Sugestões do histórico da máquina** e clique em **Incluir no plano**, ou use **Adicionar material** / **Adicionar serviço** para pesquisar no cadastro geral. A pesquisa usa o cadastro geral M8 existente no sistema. Informe a quantidade de cada item e salve o plano.
3. Na linha do plano salvo, clique em **Gerar orçamento**. Escolha a empresa e o cliente. O cliente da locação/empréstimo atual tem preferência; havendo vários clientes de cadastro, escolha o correto. Sem vínculo, o rascunho fica com cliente a definir.
4. Clique em **Salvar rascunho e abrir orçamento**. O sistema salva o rascunho e abre **Orçamentos** com máquina, cliente, modelo, série, revisão e itens preenchidos. Os preços priorizam a última venda do cliente/equipamento em OS processada, concluída e aprovada. Sem histórico compatível, usam o cadastro M8 da empresa escolhida (com alternativa nas outras empresas); preços ausentes ficam pendentes. Quantidades e unidades do plano são preservadas. Revise os valores antes de enviar ao cliente.
5. Inclua ou remova itens, ajuste quantidades e preços e salve normalmente. Essas alterações no orçamento não modificam o plano original. Itens do plano e do histórico são unificados pelo código e tipo, mesmo em rascunhos antigos com identificadores diferentes. Para atualizar os preços de um rascunho já salvo, use **Usar últimas vendas nos itens selecionados** e salve; abrir o rascunho não sobrescreve preços ajustados manualmente.
6. Em **Registros de preventiva**, o registro **Orçamento criado** informa plano, número, cliente, data e responsável, com link para reabrir o rascunho.

## Alertas

E-mail, WhatsApp e PDF incluem um link **Abrir plano / preparar orçamento** para o equipamento e plano específicos. A abertura do link exige acesso ao sistema e não cria um orçamento automaticamente. A criação ocorre ao confirmar **Salvar rascunho e abrir orçamento**. Não é necessário reimportar os workflows n8n que já consomem os campos `html`, `whatsapp` e `pdf` da API.

## Persistência e validação

- Os itens são armazenados em `web_equipment_plans.document.items`: tipo, código M8, descrição, unidade e quantidade. Até 100 itens, sem repetir o mesmo código e tipo; quantidade positiva com até três casas decimais.
- O servidor confirma a existência dos códigos no cadastro M8 e atualiza a descrição ao salvar e ao gerar o orçamento. A unidade dos materiais com unidade cadastrada permanece fixa. Para serviços e materiais sem unidade no cadastro, a unidade é editável no plano e preservada no orçamento (por exemplo, pacote, hora ou kit). Planos antigos sem `items` continuam funcionando.
- Rascunho (`web_quotes`) e histórico (`web_equipment_events`, `kind=plan`, `document.action=quote`) são gravados na mesma transação. O evento preserva plano, versão, itens, responsável e referência ao orçamento.
- Uma repetição da mesma solicitação reaproveita o orçamento criado, evitando duplicidade após falha de rede. Novas solicitações explícitas podem gerar novos rascunhos.
- Planos arquivados, versões desatualizadas, clientes não vinculados e códigos removidos são rejeitados. Gerar orçamento não altera a última intervenção, horímetro ou previsão do plano.
- Usa as tabelas existentes, sem nova migração. Não altera dados de OS ou cadastros do ERP.

Validação automatizada: itens/quantidades, persistência, dados do orçamento, preço pendente, vínculo por plano, repetição de solicitação, rollback de rascunho quando a auditoria falha, links em relatórios e fluxo no navegador.

## Sugestões pelo histórico

O editor reutiliza a consulta da aba Orçamentos: cliente + série válida (inclusive encontrada nas observações ou no equipamento instalado); série vazia ou NC usa o ID do equipamento. O modelo só participa da identificação do catálogo do fabricante. Apenas itens com histórico de OS processadas e coleta concluída aparecem nas sugestões; materiais reprovados/excluídos são desconsiderados.

Selecione o cliente do histórico; o cliente único ou da locação atual vem selecionado. Use **Buscar outro cliente** para localizar um cliente anterior e selecioná-lo no campo **Cliente do histórico**. A lista permite filtrar materiais/serviços e pesquisar código ou descrição. São dez sugestões por página, ordenadas pela utilização mais recente e, nos empates, estoque/origem como em Orçamentos. Cada item mostra última OS, empresa, data, quantidade e preço, além de até cinco utilizações recentes. Ao incluir, a quantidade começa em 1 e pode ser ajustada; o consumo de uma OS anterior não é adotado automaticamente para uma nova revisão. Itens já incluídos ficam bloqueados para evitar duplicidade.

## Exclusão de rascunhos

Abra o orçamento e clique em **Excluir rascunho**. Após confirmar, ele sai da lista da equipe e não pode mais ser editado. Alterações concorrentes impedem a exclusão até reabrir a versão atual. O registro interno preserva quem excluiu e quando; o histórico do plano permanece com a indicação de rascunho excluído. Essa operação não exclui o plano nem seus itens.
