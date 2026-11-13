# Ajustes de apontamentos com validação posterior

Novos ajustes e inclusões manuais enviados pelo técnico são aplicados na mesma transação em que a solicitação é recebida. O status permanece `pending` para análise pelos gestores, com `applied_at` e `applied_by` registrando a aplicação. Os totais e custos utilizam os horários corrigidos imediatamente, preservando os horários originais no histórico. Sem conexão, a alteração continua na fila até ser recebida pelo servidor.

A aprovação de um ajuste já aplicado registra somente a decisão: não reaplica nem desfaz correções posteriores. A reprovação mantém os horários, registra o motivo, conclui as cópias da tarefa dos gestores e cria avisos de WhatsApp na fila de mensagens para o solicitante e para o planejador. O planejador é resolvido pelo fluxo da operação, pelo último despacho ou pelo criador ativo da programação. Os avisos explicam que a correção deve ser tratada manualmente. Fonte única por solicitação e destinatário impede duplicidade.

Ajustes já aplicados não bloqueiam novas correções, replicação, exclusão pelo planejamento, revisão ou liberação da OS enquanto aguardam análise. As validações de permissão, justificativa, versão, horários e sobreposição continuam em vigor.

Solicitações antigas que ainda não haviam sido aplicadas mantêm o fluxo anterior até análise; não são aplicadas em lote pela migração. Um ajuste offline capturado antes do encerramento daquele técnico pode ser recebido depois, desde que o encerramento tenha data registrada e as demais validações sejam atendidas. Novos ajustes capturados após o encerramento continuam bloqueados para o técnico. Isso não recupera automaticamente pausas, retomadas ou finalizações antigas com vínculo inválido; esses casos precisam de conferência da fila do aparelho.

A migração `web/sql/114_time_adjustments_immediate.sql` adiciona os registros de aplicação e ajusta os índices de pendências. Foi aplicada em 13/11/2026, sem modificar horários de apontamentos existentes e sem gerar notificações reais na implantação. Deve acompanhar a publicação do código.
