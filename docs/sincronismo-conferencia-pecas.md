# Conferência de peças offline e alterações da lista

O aplicativo encadeia os registros de cada operação e os apontamentos de atividade do técnico. Uma conferência rejeitada mantém seus dependentes protegidos; registros independentes continuam sendo enviados.

O servidor compara identidades completas (empresa, OS e item M8). No reprocessamento offline, peças adicionadas depois da captura ficam intocadas, e peças removidas sem quantidade informada podem ser conciliadas. O evento registra `listReconciliation` com as identidades adicionadas e removidas. Nenhuma quantidade é transferida entre itens. Reservas, versões e limites de devolução continuam validados. Reenvios que já correspondem às quantidades atuais não falham apenas pela versão de uso desatualizada.

Peças removidas com retirada ou devolução informada continuam exigindo conferência manual. Não excluir a fila ou substituir IDs para forçar seu envio. Solicitar a cópia das pendências para comparar o registro capturado com as peças atuais e os recibos do servidor.

A correção é do servidor, sem mudança nos arquivos embarcados no APK. Após a publicação, usar **Reprocessar este registro** na conferência; seus dependentes poderão continuar quando ela for confirmada. A recuperação de uma fila específica depende dos dados exportados e das demais validações (participação ativa, horários, sessão e reservas).
