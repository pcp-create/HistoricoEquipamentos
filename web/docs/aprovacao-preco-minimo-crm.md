# Aprovação de preço mínimo na geração da OS

A geração de OS a partir da proposta consulta os mínimos atuais do M8 e compara o preço unitário líquido, incluindo desconto. Sem informação válida, não inicia a conversão. Produtos abaixo do mínimo exigem uma tarefa de aprovação; serviços não utilizam o cadastro de mínimo dos produtos.

## Fluxo

1. Em **Pedido de Venda (Gerar OS)**, o sistema mostra os produtos abaixo do mínimo e solicita responsável e justificativa.
2. Podem aprovar administradores e funcionários ativos com cargo Gestor, Coordenador ou Diretor (incluindo as formas femininas). O responsável precisa acessar Tarefas e ter WhatsApp cadastrado, conforme o fluxo existente de atribuição.
3. A tarefa apresenta os valores, a justificativa e o acesso à proposta. Sua criação e o registro da aprovação são atômicos. A notificação é enfileirada no fluxo existente; o envio depende do consumidor da fila.
4. Depois de aprovada, o solicitante retorna à proposta e gera ou continua a OS. O servidor verifica a aprovação novamente. Alterações em empresa, cliente, tipo de OS, itens, quantidades ou preços exigem nova aprovação. Um aumento do mínimo além do aprovado também exige nova decisão.
5. Antes de cada produto abaixo do mínimo, salva-se um registro durável com o mínimo original, temporário, aprovação e etapa do envio. Só então o sistema reduz o mínimo, confirma a alteração, inclui o produto uma vez e restaura o valor original, confirmando-o por leitura.

## Interrupções e recuperação

- O bloqueio por produto usa uma transação PostgreSQL, compatível com o pool de conexões. O diário de restauração é confirmado em transações independentes antes de modificar o M8.
- Enquanto houver restauração pendente, novos envios desse produto pelo fluxo de criação da OS ficam bloqueados. Interrupção do processo não apaga o diário.
- Falha na inclusão também provoca tentativa de restauração. Uma resposta ambígua não provoca repetição automática da inclusão.
- Se houver falha na restauração, a proposta apresenta o produto pendente. Um administrador deve conferir que o processamento terminou no M8 e usar **Restaurar mínimo do produto**. Essa ação nunca inclui itens.
- Se o ID do produto incluído foi confirmado e registrado, continuar a etapa reaproveita esse ID. Sem confirmação, é necessário verificar a OS no ERP antes de autorizar uma tentativa. O sistema não consegue deduzir com segurança se um POST sem resposta foi executado.
- Se o mínimo atual divergir tanto do original quanto do temporário, o sistema bloqueia a restauração automática para não sobrescrever uma edição externa. É necessário reconciliar o cadastro no ERP e conferir novamente.
- O mínimo é um dado compartilhado do M8. A API não oferece alteração condicional atômica ou exceção por OS; o bloqueio local não impede operações feitas diretamente no ERP durante essa janela. Não há garantia de restauração imediata durante indisponibilidade do ERP; nesses casos o diário e o bloqueio permanecem até recuperação administrativa.

## Publicação

Aplicar `web/sql/129_crm_price_approvals.sql` antes do código que utiliza as novas tabelas. A migração cria registros de aprovação e recuperação com RLS, sem alterar preços do ERP. O usuário de banco do servidor deve ter acesso a essas tabelas, seguindo o padrão das demais migrações.

A validação automatizada utiliza banco local PGlite, navegador e respostas simuladas do M8. Não executar testes de inclusão na OS 15564: seus materiais já foram incluídos manualmente. Antes de habilitar o fluxo em produção, conferir a permissão PATCH de produto da credencial M8 em ambiente de homologação.
