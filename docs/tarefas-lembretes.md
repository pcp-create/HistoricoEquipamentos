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

## Recorrência

Aplique também `web/sql/023_task_reminder_recurrence.sql` antes de publicar esta
versão. O workflow existente mantém o mesmo contrato; não exige reimportação.

No formulário é possível escolher não repetir, diariamente, dias úteis
(segunda a sexta, sem calendário de feriados), semanalmente, mensalmente ou
anualmente. O intervalo pode ser de 1 a 99 unidades, permitindo quinzenal,
bimestral, trimestral e outras combinações. Na opção semanal, selecione os dias.
O término pode ser sem data final, em uma data inclusive ou após 1 a 1.000
ocorrências, contando o primeiro alerta. Uma prévia mostra as próximas datas.

O modelo segue os controles comuns de calendários ([Google Calendar](https://support.google.com/calendar/answer/37115)),
com uma regra explícita para meses curtos: o dia 31 passa para o último dia do
mês e retorna ao dia original no mês seguinte. Também há a opção mensal de
último dia do mês. A primeira ocorrência sempre mantém a data/hora informada.
O horário usa Brasília (UTC−03), como os alertas avulsos existentes.

Cada confirmação de envio cria somente a próxima ocorrência, com índice único
por série. Repetir a mesma confirmação não cria outro alerta. Se o fluxo ficar
parado, envia o alerta pendente uma vez e pula os horários já vencidos; esses
horários contam no limite de ocorrências. O destinatário permanece fixo.
Concluir a tarefa encerra a série, inclusive se ela for reaberta depois.
Cancelar a recorrência interrompe os próximos alertas. Alertas já em envio
não podem ser cancelados. Destinatários indisponíveis interrompem os envios.

O agendamento e cancelamento aparecem imediatamente na tela, com restauração
em caso de falha ao gravar. Nenhuma mensagem é enviada pela criação da série;
a entrega continua dependendo do workflow do n8n.
