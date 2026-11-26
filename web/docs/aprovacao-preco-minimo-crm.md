# Aprovação de preço mínimo na geração da OS

A geração de OS a partir da proposta consulta os mínimos atuais do M8 e compara o preço unitário líquido, incluindo desconto. Sem informação válida, não inicia a conversão. Produtos abaixo do mínimo exigem aprovação individual por um perfil autorizado; serviços não utilizam o cadastro de mínimo dos produtos.

## Fluxo

1. Em propostas abertas, cada produto abaixo do mínimo mostra **Aprovar** sob o valor unitário. Somente administradores e funcionários ativos com cargo Gestor, Coordenador ou Diretor (incluindo as formas femininas) podem aprovar.
2. A aprovação registra usuário, nome, data/hora, empresa, cliente/lead, produto, quantidade, preço líquido e mínimo consultado no M8. A tela mostra nome e horário de Brasília. Mudanças nesses dados do item invalidam sua autorização; mudanças em outros itens não a invalidam.
3. Ao concluir a revisão com pendências, o sistema informa a quantidade e oferece **Ir para produtos**, **Concluir revisão** e **Cancelar**. Concluir não aprova preços implicitamente.
4. Gerar ou continuar a OS exige campos obrigatórios preenchidos e aprovação de todos os itens abaixo do mínimo atual. A revisão é opcional: pode-se gerar diretamente da criação. Se houver revisão em andamento, ela deve ser concluída ou a proposta deve voltar à criação. Pendências de preço podem ser aprovadas diretamente por perfis autorizados ou encaminhadas à revisão. Não se abre uma tarefa separada de aprovação de preço.
5. Antes de incluir cada produto, o sistema confere o mínimo atual e a aprovação do item. O preço aprovado é enviado diretamente ao M8 com o usuário API.RJ. Não há alteração do preço mínimo do cadastro.

## Interrupções e recuperação

Respostas ambíguas do ERP não provocam repetição automática da inclusão. Pendências de restauração geradas pelo fluxo antigo continuam bloqueando o produto até conferência administrativa. A ação de restaurar mínimo atende somente esses registros antigos e nunca inclui itens. IDs de itens já confirmados nesses registros são reaproveitados para evitar duplicidade.


## Publicação

Aplicar `web/sql/129_crm_price_approvals.sql` e `web/sql/130_crm_item_price_approvals.sql` antes do código que utiliza as novas tabelas. A migração cria registros de aprovação e recuperação com RLS, sem alterar preços do ERP. O usuário de banco do servidor deve ter acesso a essas tabelas, seguindo o padrão das demais migrações.

A validação automatizada utiliza banco local PGlite, navegador e respostas simuladas do M8. Não executar testes de inclusão na OS 15564: seus materiais já foram incluídos manualmente. Antes de habilitar o fluxo em produção, conferir a permissão PATCH de produto da credencial M8 em ambiente de homologação.

A barra acima das abas mostra o status atual e permite solicitar revisão, concluir revisão, enviar ao cliente, gerar pedido ou voltar à criação. Cada ação valida suas condições no servidor. Voltar à criação encerra a tarefa de revisão em andamento, preserva PDFs enviados e incrementa a revisão após um envio. Pedidos em andamento ou propostas encerradas não podem voltar à criação.

Ao clicar em Revisada, a confirmação Concluir Revisão? permite concluir diretamente da criação. Nessa transição, campos obrigatórios e todas as aprovações de preço são exigidos; não é possível ignorar preços pendentes.

Na etapa Enviada ao cliente, o usuário escolhe e-mail, WhatsApp ou registro de envio anterior. Todas as opções exigem proposta revisada. O WhatsApp prepara o PDF sem alterar o status; o usuário compartilha o arquivo (ou baixa e anexa na conversa) e confirma o envio. O registro manual não envia mensagens. O PDF preparado é preservado junto da revisão; alterações na proposta invalidam a confirmação de um preparo anterior. Aplicar a migração 131 antes de publicar essas opções.

## Permissão API.RJ validada

A inclusão de itens na OS passa a enviar diretamente o preço aprovado ao M8, sem reduzir temporariamente o mínimo do cadastro. A aprovação por item no CRM continua obrigatória. Se o ERP rejeitar o preço, o envio mantém o tratamento de erro existente, sem tentativa automática de alterar o cadastro. A rotina de restauração permanece disponível para pendências anteriores.
