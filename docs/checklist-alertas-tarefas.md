# Indicadores e tarefas de alerta na revisão

O Indicador de Status original mantém suas opções personalizadas. Os novos tipos fixos são:

- Indicador de Status 2 (`flag2`): OK, NOK, NA.
- Indicador de Status 3 (`flag3`): Sim, Não, NA.
- Indicador de Status 4 (`flag4`): Operando normalmente, Operando com falha, Bloqueado, Parado, Desligado / Desenergizado.

No editor, os checkboxes das respostas configuram `alertOptions` por campo. Nenhum alerta é ativado por padrão. Os tipos fixos não permitem edição das opções, inclusive via API. Modelos já liberados preservam sua cópia do checklist; a configuração alterada vale para novas liberações, preservando o histórico.

A resposta selecionada que consta em `alertOptions` fica vermelha no preenchimento, revisão, relatório unificado e PDF. Os alertas são calculados no servidor a partir das respostas salvas, inclusive campos ocultos do relatório.

Na conclusão da revisão com alertas, o planejador informa responsável ativo, descrição e tipo de relatório (Completo, Resumido ou Orçamento). É criada uma tarefa por operação, reunindo seus alertas, vinculada à OS e acompanhada do PDF da operação no modo escolhido. O cadastro do responsável deve atender às regras existentes de tarefas (incluindo WhatsApp). A notificação de atribuição segue o mecanismo existente de tarefas.

Revisão, alterações de horímetro, tarefa, notificação e anexo compartilham a transação. Falha na tarefa, foto ou PDF impede a conclusão e desfaz as alterações. O bloqueio/versão da operação evita tarefas duplicadas por requisições concorrentes. Uma nova revisão da mesma combinação de campos/valores reutiliza a tarefa registrada em `document.checklistAlertTasks`; novos alertas criam uma nova tarefa. O PDF anexado é o retrato da revisão que criou a tarefa.

Não exige migração de banco. Os dados usam os documentos existentes e as tabelas de tarefas/anexos já disponíveis.

Validação: `checklist-alerts.test.ts` (opções fixas, respostas, permissões, transação, PDF e repetição), `checklist-alerts.spec.ts` (cores, tarefa obrigatória, preservação da edição e configuração dos indicadores), além dos testes existentes de revisão/relatórios.
