# Conferência de peças offline e alterações da lista

O aplicativo encadeia os registros de cada operação e os apontamentos de atividade do técnico. Uma conferência rejeitada mantém seus dependentes protegidos; registros independentes continuam sendo enviados.

O servidor compara identidades completas (empresa, OS e item M8). No reprocessamento offline, peças adicionadas depois da captura ficam intocadas, e peças removidas sem quantidade informada podem ser conciliadas. O evento registra `listReconciliation` com as identidades adicionadas e removidas. Nenhuma quantidade é transferida entre itens. Reservas, versões e limites de devolução continuam validados. Reenvios que já correspondem às quantidades atuais não falham apenas pela versão de uso desatualizada.

Peças removidas com retirada ou devolução informada continuam exigindo conferência manual. Não excluir a fila ou substituir IDs para forçar seu envio. Solicitar a cópia das pendências para comparar o registro capturado com as peças atuais e os recibos do servidor.

A correção é do servidor, sem mudança nos arquivos embarcados no APK. Após a publicação, usar **Reprocessar este registro** na conferência; seus dependentes poderão continuar quando ela for confirmada. A recuperação de uma fila específica depende dos dados exportados e das demais validações (participação ativa, horários, sessão e reservas).

## Recibos e antecedentes excluídos — APK 2.2.24

`GET /api/field?receipts=<ids>` consulta até 200 IDs e retorna somente ações/fotos pertencentes à conta autenticada, incluindo operação e ID da foto no servidor. Não grava dados nem confirma um ID ausente.

Ao sincronizar uma fila com dependências descartadas, o cliente consulta esses recibos. Remove somente itens confirmados com mesmo ID, tipo e operação, preserva o mapeamento de fotos e atualiza os dados locais. Um dependente não confirmado só perde a marca de antecedente excluído se todos os antecedentes arquivados tiverem recibo. Falhas de consulta ou recibos divergentes preservam a fila. A cópia arquivada continua disponível na exportação.

A recuperação de exportações com horários anteriores a sessões já recebidas deve validar os pares completos de início/fim e a ausência de sobreposição sob o lock do técnico. Preservar IDs e horários originais e registrar a origem da recuperação nos eventos. Não contornar a validação de horários de uma requisição isolada sem conferir os intervalos completos.
