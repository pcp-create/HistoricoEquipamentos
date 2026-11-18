# Indicadores e tarefas de alerta na revisão

O Indicador de Status original mantém suas opções personalizadas. Os novos tipos fixos são:

- Indicador de Status 2 (`flag2`): OK, NOK, NA.
- Indicador de Status 3 (`flag3`): Sim, Não, NA.
- Indicador de Status 4 (`flag4`): Operando normalmente, Operando com falha, Bloqueado, Parado, Desligado / Desenergizado.

No editor, os checkboxes das respostas configuram `alertOptions` por campo. Nenhum alerta é ativado por padrão. Os tipos fixos não permitem edição das opções, inclusive via API. Modelos já liberados preservam sua cópia do checklist; a configuração alterada vale para novas liberações, preservando o histórico.

A resposta selecionada que consta em `alertOptions` fica vermelha no preenchimento, revisão, relatório unificado e PDF. Os alertas são calculados no servidor a partir das respostas salvas, inclusive campos ocultos do relatório.

A aba **Alertas da OS** na janela “Revisar operações” reúne os indicadores de todas as operações, identificados pela operação de origem. A revisão individual valida o relatório, as peças, os apontamentos e o horímetro, sem exigir geração de tarefas de alerta.

Os alertas podem ser selecionados entre operações diferentes e agrupados em uma tarefa ou separados em várias. Cada tarefa exige responsável ativo, descrição e tipo de relatório (Completo, Resumido ou Orçamento); pode ser de ação ou aprovação. A tarefa recebe um PDF de cada operação de origem selecionada e notas com os comentários e números das operações. As regras existentes de cadastro e notificação do responsável continuam valendo.

A ação **Concluir revisão da OS** exige todas as operações revisadas e cobertura exata dos alertas por tarefas. Tarefas e anexos são criados somente nessa ação, numa única transação: qualquer falha desfaz tarefas, notificações e comprovante de revisão. O comprovante da OS é persistido em `web_access_events`, evento `service_order_reviewed`, com versões/status das operações, usuário, data e tarefas/alertas associados. Não é necessário alterar operações concluídas, que permanecem imutáveis.

Os alertas usam operação + etapa + campo + valor como identidade. Tarefas antigas em `document.checklistAlertTasks` continuam reconhecidas, evitando duplicação. A exclusão de uma tarefa deixa seus alertas pendentes novamente. Repetir a mesma conclusão não duplica tarefas ou anexos. Reabrir, editar, adicionar ou remover uma operação invalida a assinatura da revisão da OS e exige uma nova conclusão; tarefas que continuam cobrindo os mesmos alertas são reaproveitadas.

A exportação final, individual ou unificada, e os envios ao cliente ficam bloqueados no servidor até concluir a revisão da OS. As prévias do portal técnico permanecem disponíveis para conferência do próprio atendimento. A conclusão individual mantém os efeitos existentes no horímetro e nas preventivas; esses efeitos não aguardam a tratativa dos alertas da OS.

Validação: `checklist-alerts.test.ts`, `checklist-alerts.spec.ts`, `order-operations-review.spec.ts`, `operation-review.spec.ts`, `order-report-store.test.ts`, `field-operations.test.ts` e testes de horímetro.
