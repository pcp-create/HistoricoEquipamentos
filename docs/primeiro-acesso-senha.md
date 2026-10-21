# Senha inicial e reset

A Administração cria contas com senha inicial `123456`. O botão **Reset de senha** exige confirmação e redefine a conta vinculada para esse padrão. Nos dois casos, `app_metadata.must_change_password` é ativado no Supabase Auth pelo servidor.

O login encaminha a conta pendente para `/alterar-senha`, preservando o destino (web, Portal Técnico ou Portal Vendedor). O layout também substitui o conteúdo pela troca de senha, e `requireUser()` bloqueia as APIs enquanto a troca estiver pendente. Somente a troca e o logout aceitam essa sessão limitada. A marcação usa metadados de aplicação, não os metadados editáveis pelo usuário.

A nova senha exige confirmação, 6 a 128 caracteres e não pode ser `123456` (inclusive com espaços externos). `/api/password` valida origem, identidade, usuário ativo e pendência, atualiza a senha e desativa a marcação. Operações de reset e troca usam a mesma trava transacional. Auditoria registra criação, reset e troca sem armazenar senhas.

Requer `SUPABASE_SERVICE_ROLE_KEY` no servidor, já utilizada para provisionamento de contas. Não exige migração e não reseta contas existentes automaticamente. As regras de senha do provedor também devem aceitar a senha inicial definida; erros são informados sem liberar o acesso pendente.

Testes: `employee-password.test.ts`, `initial-access.test.ts` e `password-change.spec.ts`.

## Aviso de reset pelo WhatsApp

O reset exige usuário habilitado e WhatsApp válido no cadastro. A transação registra uma entrega em `web_password_reset_notifications` (migração `055_password_reset_notifications.sql`) somente quando o reset é concluído. A tabela não armazena senha nem o texto da mensagem.

O próximo ciclo `sync` com `deliver: true` de `/api/tasks/automation` inclui o aviso com o mesmo formato das demais notificações (`id`, `token`, `number`, `text`). O workflow existente encaminha pelo WhatsApp do assistente e confirma via `ack`; IDs `password-reset:` são tratados separadamente. O workflow de referência de alertas roda a cada cinco minutos. A interface informa aviso agendado, sem afirmar entrega imediata.

A mensagem se identifica como Assistente RJ (DSU), informa o link oficial `/login`, o e-mail e a senha inicial, e explica a troca obrigatória. A fila verifica que o telefone, o vínculo de login e o acesso continuam válidos antes de liberar a entrega. Um novo reset ou uma troca da senha cancela avisos ainda pendentes; mensagens já despachadas não podem ser recolhidas. Cada aviso é liberado uma única vez, seguindo o padrão de prevenção de duplicidade das notificações existentes. Falhas de envio devem ser verificadas na automação, sem reenvio cego.

Validação adicional: `password-reset-notifications.test.ts` e `employee-password.test.ts`. Os testes usam transporte simulado, sem enviar mensagens para usuários reais.
