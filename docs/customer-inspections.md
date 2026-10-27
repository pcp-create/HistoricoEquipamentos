# Manutenções e inspeções por cliente

O acesso `/equipamentos/preventivas` passa a se chamar **Controle de Manutenções**. Os planos por máquina e por tipo (2.000 h, 4.000 h etc.) permanecem com seu histórico e suas regras. **Controle de Inspeções**, em `/equipamentos/inspecoes`, é um controle independente por cliente e tipo, abrangendo todas as máquinas vinculadas ao cliente, sem criar um plano por equipamento.

## Planos e rotas

Cada cliente pode ter um plano de cada tipo, com nome da rota, periodicidade configurável em dias ou meses, antecedência em dias, última inspeção ou data da primeira inspeção, observações e ativação. Os tipos iniciais são **Coleta e análise de vibração** e **Detecção de vazamentos de ar comprimido**; outros tipos podem ser cadastrados. A rota organiza a lista e permite filtrar o roteiro de atendimento.

A última inspeção considera a maior data entre a referência inicial e os registros de execução. Um registro histórico antigo não substitui uma coleta mais recente. A próxima inspeção aplica a periodicidade à última execução; sem histórico, usa a primeira data programada. Meses respeitam o último dia do mês. O status é Em dia, Próximo do vencimento, Vence hoje ou Vencida, calculado em Brasília. Marcar um plano como inativo preserva seu histórico e encerra sua pendência automática.

## Tarefas e orçamentistas

O plano entra no gerador de tarefas existente com origem **Inspeção de Cliente**, chave `inspection:<plano>` e ciclo da última inspeção. Próximo do vencimento, Vence hoje e Vencida geram uma tarefa automática sem equipamento individual. A atribuição usa a mesma regra de cidade/UF da Divisão Comercial utilizada nas preventivas de clientes. Sem regra válida, a tarefa fica sem responsável para revisão. Atribuição e conclusão utilizam as notificações de tarefas existentes.

A execução encerra a tarefa do ciclo anterior. Se o próximo ciclo já estiver na janela de alerta, abre uma nova ocorrência. Repetir a coleta ou atualizar o mesmo relatório não duplica a execução vinculada. Gravação do plano/execução e atualização das tarefas ocorrem na mesma transação. A verificação periódica de tarefas também inclui os planos de inspeção. A tarefa permite abrir o plano, e o plano permite listar suas tarefas.

## Relatório de vibração

No editor salvo, **Ir ao plano / criar plano de inspeção** leva o relatório ao controle de inspeções. É necessário salvar o relatório antes de seguir. O cliente e a coleta vêm da versão salva. A data é obtida das datas de coleta/medição das máquinas selecionadas; a data de emissão não é utilizada. São aceitos AAAA-MM-DD e DD/MM/AAAA. Havendo várias coletas no relatório, considera-se a mais recente, mantendo o relatório completo como referência. Datas inválidas, ausentes ou futuras precisam ser corrigidas antes de registrar a inspeção.

Ao salvar um relatório de cliente com plano de vibração ativo, a coleta é registrada automaticamente nesse plano e as tarefas são atualizadas. Editar um relatório já vinculado atualiza a mesma execução e recalcula o vencimento; a versão anterior permanece protegida pelo controle de concorrência do relatório. Um relatório vinculado não pode ser transferido para outro cliente sem resolver esse vínculo. Relatórios antigos não são importados em massa; podem ser vinculados pelo botão do editor.

## Execuções e orçamento

O plano permite registrar uma inspeção manual (incluindo caça-vazamentos), data, OS e observações. **Gerar orçamento** cria um rascunho interno com cliente, tipo, periodicidade e referência da última coleta/relatório. O orçamento fica vinculado ao plano; serviços, valores e emissão devem ser preenchidos no módulo de orçamentos. Não há preços inventados, envio ao ERP ou criação automática de OS. Histórico, relatórios e orçamentos ficam acessíveis pelo plano.

## Instalação

Requer as tabelas atuais de tarefas, orçamentos e relatórios de vibração. Execute a migration aditiva antes de publicar o código:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-customer-inspections.mts
```

A migration `080_customer_inspections.sql` cria tipos, planos, execuções e vínculos de orçamentos com RLS e sem acesso direto dos papéis públicos. O instalador usa checksum e não modifica os planos preventivos existentes. Usuários precisam estar ativos para acessar ou alterar inspeções. O gerador geral mantém compatibilidade com ambientes que ainda não instalaram essa migration.
