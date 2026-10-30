# Transferência entre oficinas

A ficha de uma permanência aberta oferece **Transferir equipamento**. O usuário seleciona uma oficina ativa diferente da origem, informa a saída da origem, a entrada no destino e observações opcionais. As datas e horas usam o fuso do navegador na edição; são transmitidas com fuso explícito e apresentadas no histórico em America/Sao_Paulo.

A gravação ocorre em uma única transação: bloqueia a permanência, verifica sua versão, encerra a origem e cria uma permanência aberta no destino. A máquina nunca fica com duas entradas abertas. Nenhuma parte é confirmada se a outra falhar. Reenvio com a versão antiga não repete a transferência. A saída não pode anteceder a entrada original, a chegada não pode anteceder a saída e as datas não podem estar no futuro (tolerância técnica de um minuto). A confirmação destina-se a transferências cuja chegada já ocorreu, sem presumir uma etapa de transporte em andamento.

Etapa, previsão, observações de entrada e identificação de frota/cliente são preservadas. Os orçamentos vinculados permanecem na ficha antiga e são vinculados também à nova. OSs e tarefas associadas ao equipamento seguem a associação por ID; a transferência não altera documentos do ERP ou responsáveis por tarefas. Componentes em conserto externo devem ter o retorno registrado, assim como na saída normal.

Há eventos nas duas fichas: **Saída por transferência** e **Entrada por transferência**. Registram usuário, data do registro, origem, destino, datas e horas efetivas de saída/entrada, observação e IDs das permanências. O histórico mostra um botão para abrir a ficha correspondente na outra oficina, inclusive após transferências sucessivas. O usuário é levado ao histórico do destino após confirmar.

A permanência antiga mantém seus tempos até a saída; a nova contabiliza a etapa preservada a partir da chegada. A transferência conta como saída física na origem e entrada física no destino nos gráficos, respeitando os respectivos filtros. Não é estorno nem ajuste de conferência. Não há nova migração: usam-se as permanências, os eventos e os campos JSON existentes.

Testes cobrem datas, destino, versão, componentes externos pendentes, transação/rollback, manutenção da etapa e dos orçamentos, indicadores de ocupação, vínculo entre históricos e formulário no celular.
