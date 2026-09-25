# Alertas agendados de tarefas

Dentro da tarefa, use **Criar alerta**, escolha data/hora de Brasília e clique em
**Agendar alerta**. O destinatário é o responsável ativo com WhatsApp cadastrado
no momento da criação. Trocar o responsável posteriormente não redireciona um
lembrete já agendado. Cancele e agende novamente para outro destinatário.

A lista exibe horário, destinatário e estado. É possível cancelar um alerta
pendente antes de ele ser reclamado pelo fluxo. O histórico registra criação e
cancelamento com autor. Tarefas concluídas e destinatários inativos/sem telefone
válido não recebem o lembrete; o registro fica como não enviado.

## Ativar no n8n

1. Publique o código e aplique `web/sql/017_task_reminders.sql` (já aplicada ao
   banco configurado nesta implementação).
2. Importe `automations/n8n/tarefas-lembretes.json` como um novo workflow.
3. Em Configuração, informe a URL da Evolution, instância e `deliver: true`.
4. Selecione a credencial de autenticação do sistema em Buscar alertas agendados
   e Confirmar entrega; use a credencial da Evolution em Enviar WhatsApp.
5. Ative/publice o workflow. A agenda `* * * * *` consulta a cada minuto, incluindo
   fins de semana. Não é preciso manter o sistema aberto.

Esse fluxo não substitui os avisos de atribuição nem o resumo diário. Recebe
somente lembretes cujo horário chegou e confirma após sucesso do envio. Há lote
de até 20 por execução e reserva por 30 minutos; sem confirmação, uma execução
posterior poderá tentar novamente. Uma interrupção após o WhatsApp aceitar e
antes da confirmação pode gerar reenvio (entrega pelo menos uma vez). Não
reexecute manualmente uma etapa de envio já concluída. Se o n8n ficar parado,
os alertas pendentes serão retomados quando ele voltar: não há garantia de
entrega no segundo exato.
