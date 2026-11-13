# Contatos de clientes nas visitas

Os contatos de clientes M8 (`m8:<pessoaId>`) são consultados em `GET /v1/configuracoes/cliente/{clienteId}/contato`, com paginação de 1.000 itens. A empresa segue o cadastro importado do cliente, priorizando a empresa 1. Os contatos são conciliados com os registros locais para preservar os vínculos e os históricos das visitas. Contatos locais anteriores continuam disponíveis; a consulta não os envia automaticamente ao ERP.

O formulário de novo contato usa `POST` no mesmo endpoint. O tipo de contato não é exibido no formulário: novos cadastros usam sempre `Geral`, definido também no servidor. Campos obrigatórios do contrato `PessoaContatoRequestDto`: `nome`, `telefone`, `email`, `tipo`, `cargoId`. O cargo é selecionado pelo nome no formulário. O cadastro **Cadastros → Tipos de Cargo** permite configurar descrição, ID M8 e ativo/inativo manualmente. O servidor resolve o ID do cargo selecionado e ignora IDs M8 digitados diretamente pelo cliente da API. A documentação consultada não oferece endpoint de consulta de cargos. Campos opcionais: `telefoneAdicional`, `cpfCnpj`, `observacao`. Tipos: Geral, OrdemCompra, Financeiro, Supervisor, Motorista, Operador e Maquinista.

Leads permanecem locais. Os contatos criados pela rotina de e-mail da programação continuam locais; esta mudança atende ao cadastro de contatos das visitas.

Antes do POST, a tentativa é persistida como `sending`. Só a resposta com ID confirma `synced`. Falhas de transporte, respostas sem ID ou resultado incerto ficam bloqueados contra reenvio automático (`uncertain`); atualizar os contatos reconcilia o registro se encontrado no ERP. Rejeições explícitas permitem corrigir e tentar novamente. Nenhum contato real é criado nos testes.

Aplicar `web/sql/110_customer_contacts_m8.sql` e `web/sql/111_contact_job_types.sql` antes de publicar o código. A migração 111 foi aplicada em 12/11/2026, aproveitando somente descrições e IDs de cargo já retornados pelo ERP. A migração 102 (e-mail e cargo textual) deve estar aplicada. A migração 110 foi aplicada ao banco em 12/11/2026. Contatos ERP com o mesmo nome/telefone são preservados separadamente pelo ID M8; a unicidade de nome/telefone passa a valer somente para contatos locais.

Referência: https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json — conferido em 12/11/2026.

## Edição dos dados do contato

O lápis abre uma janela para editar nome, cargo, telefone, e-mail, telefone adicional, CPF/CNPJ e observação. O tipo de novos contatos permanece Geral. A alteração usa `PATCH /api/customer-contacts`, verifica acesso ao cliente e versão do registro. Valores vazios permitem remover campos opcionais; dados anteriores incompletos não impedem editar outro campo.

As alterações são locais, preservadas por `field_overrides` e `job_type_override_id` nas consultas posteriores ao ERP. O ator e a data ficam em `job_updated_by` e `job_updated_at`. Novas visitas e seleção de contatos para e-mail usam os dados locais atualizados; visitas antigas preservam seus registros históricos.

Cada edição com mudanças cria, na mesma transação, uma tarefa com origem **Ajuste de contato · Visitas**, cliente, identificação M8 do contato, solicitante e valores anteriores/novos. O responsável é o mesmo de **Visitas → Tarefas automáticas → Responsável pelo vínculo manual de equipamentos**; a tarefa usa a fila padrão de notificações. Se a configuração ou criação da tarefa falhar, a edição é desfeita. Salvar sem mudanças não gera tarefa.

Não há envio de atualização ao M8: o responsável ajusta o cadastro manualmente. O contato continua usando os valores locais nas próximas sincronizações.

A migração `web/sql/115_customer_contact_edits.sql` foi aplicada em 13/11/2026, adicionando somente a coluna de alterações locais, sem modificar contatos ou gerar tarefas reais. A migração acompanha esta versão do código. A migração 113 foi aplicada em 13/11/2026.
