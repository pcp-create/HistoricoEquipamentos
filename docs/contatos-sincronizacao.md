# Contatos e sincronização M8

A lista reúne contatos importados do M8 e contatos locais. Inclusões e edições são confirmadas no banco local antes da sincronização. O estado exibido é Migrado ou Pendente; pendências não impedem selecionar o contato em visitas ou CRM.

Cadastros → Pendências de sincronização M8 mostra o motivo da falha e permite editar cada contato ou solicitar nova conferência. E-mail continua opcional no sistema; o M8 exige e-mail para inclusão.

O servidor tenta sincronizar após salvar usando `after`. Ao atualizar a lista de contatos, também consulta o M8 e retoma até três pendências sem tentativa nos últimos cinco minutos. A fila é persistida; não depende de manter o formulário aberto. Não há um serviço contínuo de reenvio: pendências sobrevivem a interrupções e podem ser retomadas pela lista.

A API documentada do M8 oferece GET e POST de contatos, sem edição. Contatos existentes alterados localmente permanecem pendentes até o cadastro ser ajustado no M8 e os dados conferirem. Não são feitas inclusões para simular uma edição.

Uma reserva temporária evita processamento concorrente. Antes do POST, o envio é marcado como iniciado. Respostas inconclusivas nunca provocam POST automático novamente; uma consulta reconcilia pelo conteúdo. Alterações locais posteriores ao início do envio permanecem pendentes. A coleta M8 preserva alterações pendentes e os IDs locais.

Aplicar `web/sql/117_contact_sync_queue.sql` antes do deploy. A migração conserva os dados e inclui falhas anteriores e alterações locais existentes na lista de pendências.

## Exclusão de contatos

Editar e excluir estão disponíveis na seleção do contato e no CRM. A exclusão é local, mediante confirmação, e preserva o cadastro para o histórico das visitas. Contatos excluídos saem das listas e da fila de sincronização; a importação do M8 não os torna visíveis novamente. O M8 não oferece exclusão na API disponível, portanto seu cadastro permanece no ERP. Uma inclusão explícita com o mesmo nome e telefone restaura o contato local.

Aplicar `web/sql/118_contact_deletion.sql` antes de publicar esta versão.
