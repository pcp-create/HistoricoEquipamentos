# Análise para priorização da oficina — 28/10/2026

Consulta somente de leitura da base configurada do sistema, considerando entradas sem saída e sem encerramento por reconciliação, em todas as oficinas. Os números representam o momento da análise; não são constantes para a interface. Nenhuma regra nova de prioridade foi ativada.

| Sinal disponível | Quantidade |
| --- | ---: |
| Máquinas presentes | 69 |
| Equipamentos de clientes | 53 |
| Frota de locação | 16 |
| Sem previsão de saída | 62 |
| Previsão de saída vencida | 0 |
| Permanência acima de 50 dias | 47 |
| Permanência acima de 100 dias | 32 |
| Sem vínculo ao código do equipamento | 36 |
| Aguardando aprovação do cliente (etapa da ficha) | 22 |
| Aguardando aprovação interna (etapa da ficha) | 4 |
| Aguardando peças | 13 |
| Prontas para saída | 4 |
| Devolução sem conserto | 7 |
| Envios externos sem retorno | 10 |
| Envios externos sem previsão | 10 |
| Tarefas abertas vinculadas às máquinas/OSs | 7 |
| Tarefas urgentes vinculadas | 6 |
| Tarefas vencidas vinculadas | 6 |
| Tarefas de aprovação aguardando decisão | 0 |

Urgência e vencimento podem se referir à mesma tarefa: os dois conjuntos não devem ser somados. As 26 máquinas em etapas de aprovação não equivalem a 26 tarefas de aprovação; o estágio operacional e o fluxo de aprovação de tarefas são dados diferentes.

## Leitura dos resultados

A lista atual ordena por tempo total de permanência, sem avaliar automaticamente impacto ou próximo passo. Como a maior parte da base não possui previsão, zero prazos vencidos não demonstra que tudo está dentro do prazo. Mais de 50 dias também não separa bem os casos mais importantes, pois abrange 47 das 69 máquinas.

Os vínculos ausentes em 36 máquinas limitam a associação automática a OSs, valores e tarefas preexistentes. Ausência de valor ou tarefa vinculada não deve reduzir automaticamente a prioridade. O histórico observado permite acompanhar mudanças de etapa, mas não comprova retroativamente quando uma situação começou antes da importação/reconciliação.

## Proposta para discussão, ainda sem implementação

1. Compromissos e ações urgentes: previsão vencida ou próxima, tarefas vencidas e prioridade urgente. Definir janela de prazo próximo e como combinar sinais sobrepostos.
2. Liberação imediata: máquinas prontas para saída e devoluções sem conserto aguardando retirada. Medir permanência desde a etapa observada, sem presumir datas históricas.
3. Desbloqueio: aprovações de cliente/internas, peças e terceiros. Mostrar o motivo e a próxima ação, com prazo específico de cada etapa a definir.
4. Impacto: valor de cobrança aberto nos clientes, disponibilidade da frota e tempo sem avanço. Valor financeiro pode desempatar casos; nunca tratar dado ausente como zero impacto. Disponibilidade/necessidade comercial da frota exigem critérios adicionais confirmados.
5. Qualidade dos dados: ausência de previsão ou vínculo deve aparecer como motivo para completar o cadastro, sem dominar toda a lista nem ocultar casos operacionais.

Antes de ativar a seleção automática, definir ordem entre os grupos, prazos por etapa, número de itens exibidos, inclusão de frota e critérios de desempate. Cada item selecionado deverá explicar por que precisa de atenção e permitir abrir sua ficha. Até essa definição, permanece a ordenação atual por maior tempo na oficina.
