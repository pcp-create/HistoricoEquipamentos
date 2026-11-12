# CRM comercial local

- `/orcamentos`: Histórico Orçamentos M8 (somente consulta dos dados sincronizados). Links salvos de orçamentos técnicos antigos continuam funcionando.
- `/crm`: cards e abas Oportunidades, Propostas, Ordens de Serviço; pesquisa e paginação de 30 registros.
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
