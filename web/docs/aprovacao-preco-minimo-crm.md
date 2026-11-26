# Aprovação de preço mínimo na geração da OS

A geração de OS a partir da proposta consulta os mínimos atuais do M8 e compara o preço unitário líquido, incluindo desconto. Sem informação válida, não inicia a conversão. Produtos abaixo do mínimo exigem aprovação individual por um perfil autorizado; serviços não utilizam o cadastro de mínimo dos produtos.

## Fluxo

1. Em propostas abertas, cada produto abaixo do mínimo mostra **Aprovar** sob o valor unitário. Somente administradores e funcionários ativos com cargo Gestor, Coordenador ou Diretor (incluindo as formas femininas) podem aprovar.
2. A aprovação registra usuário, nome, data/hora, empresa, cliente/lead, produto, quantidade, preço líquido e mínimo consultado no M8. A tela mostra nome e horário de Brasília. Mudanças nesses dados do item invalidam sua autorização; mudanças em outros itens não a invalidam.
3. Ao concluir a revisão com pendências, o sistema informa a quantidade e oferece **Ir para produtos**, **Concluir revisão** e **Cancelar**. Concluir não aprova preços implicitamente.
4. Gerar ou continuar a OS exige campos obrigatórios preenchidos e aprovação de todos os itens abaixo do mínimo atual. A revisão é opcional: pode-se gerar diretamente da criação. Se houver revisão em andamento, ela deve ser concluída ou a proposta deve voltar à criação. Pendências de preço podem ser aprovadas diretamente por perfis autorizados ou encaminhadas à revisão. Não se abre uma tarefa separada de aprovação de preço.
5. Antes de cada produto abaixo do mínimo, salva-se um registro durável com o mínimo original, temporário, aprovação por item e etapa do envio. Só então o sistema reduz o mínimo, confirma a alteração, inclui o produto uma vez e restaura o valor original, confirmando-o por leitura.

## Interrupções e recuperação

- O bloqueio por produto usa uma transação PostgreSQL, compatível com o pool de conexões. O diário de restauração é confirmado em transações independentes antes de modificar o M8.
- Enquanto houver restauração pendente, novos envios desse produto pelo fluxo de criação da OS ficam bloqueados. Interrupção do processo não apaga o diário.
- Falha na inclusão também provoca tentativa de restauração. Uma resposta ambígua não provoca repetição automática da inclusão.
- Se houver falha na restauração, a proposta apresenta o produto pendente. Um administrador deve conferir que o processamento terminou no M8 e usar **Restaurar mínimo do produto**. Essa ação nunca inclui itens.
- Se o ID do produto incluído foi confirmado e registrado, continuar a etapa reaproveita esse ID. Sem confirmação, é necessário verificar a OS no ERP antes de autorizar uma tentativa. O sistema não consegue deduzir com segurança se um POST sem resposta foi executado.
- Se o mínimo atual divergir tanto do original quanto do temporário, o sistema bloqueia a restauração automática para não sobrescrever uma edição externa. É necessário reconciliar o cadastro no ERP e conferir novamente.
- O mínimo é um dado compartilhado do M8. A API não oferece alteração condicional atômica ou exceção por OS; o bloqueio local não impede operações feitas diretamente no ERP durante essa janela. Não há garantia de restauração imediata durante indisponibilidade do ERP; nesses casos o diário e o bloqueio permanecem até recuperação administrativa.

## Publicação

Aplicar `web/sql/129_crm_price_approvals.sql` e `web/sql/130_crm_item_price_approvals.sql` antes do código que utiliza as novas tabelas. A migração cria registros de aprovação e recuperação com RLS, sem alterar preços do ERP. O usuário de banco do servidor deve ter acesso a essas tabelas, seguindo o padrão das demais migrações.

A validação automatizada utiliza banco local PGlite, navegador e respostas simuladas do M8. Não executar testes de inclusão na OS 15564: seus materiais já foram incluídos manualmente. Antes de habilitar o fluxo em produção, conferir a permissão PATCH de produto da credencial M8 em ambiente de homologação.

A barra acima das abas mostra o status atual e permite solicitar revisão, concluir revisão, enviar ao cliente, gerar pedido ou voltar à criação. Cada ação valida suas condições no servidor. Voltar à criação encerra a tarefa de revisão em andamento, preserva PDFs enviados e incrementa a revisão após um envio. Pedidos em andamento ou propostas encerradas não podem voltar à criação.

Ao clicar em Revisada, a confirmação Concluir Revisão? permite concluir diretamente da criação. Nessa transição, campos obrigatórios e todas as aprovações de preço são exigidos; não é possível ignorar preços pendentes.

Na etapa Enviada ao cliente, o usuário escolhe e-mail, WhatsApp ou registro de envio anterior. Todas as opções exigem proposta revisada. O WhatsApp prepara o PDF sem alterar o status; o usuário compartilha o arquivo (ou baixa e anexa na conversa) e confirma o envio. O registro manual não envia mensagens. O PDF preparado é preservado junto da revisão; alterações na proposta invalidam a confirmação de um preparo anterior. Aplicar a migração 131 antes de publicar essas opções.
