# Data Prevista Programação

A coluna da lista de Programação de OS é uma previsão calculada, sem gravar nem
alterar agendamentos. Ordenação disponível no cabeçalho.

- Havendo operação programada ainda pendente de execução, usa a primeira data e
  horário. Operações concluídas, revisadas, em revisão ou canceladas não entram.
  Datas programadas vencidas são preservadas e identificadas no comentário.
- Sem programação, usa a maior previsão de chegada de material ou retorno de
  componente em serviço externo, acrescida de um dia de trabalho do calendário
  `standard`. Fins de semana e exceções sem expediente são respeitados.
- Sem pendências, usa o próximo dia de trabalho. Não estima disponibilidade de
  técnico, veículo ou duração: esses recursos são definidos no agendamento.
- O comentário identifica o material/OC ou componente determinante. Empates
  mostram todos os determinantes.
- Estoque e compras consideram empresa, produto e unidade. Materiais de OS
  vinculada seguem a mesma deduplicação já usada no detalhe da programação.
  Quantidades retiradas não são novamente exigidas no estoque.
- Compras são as compras abertas do produto na empresa, não uma reserva exclusiva
  para essa OS. Quando há várias compras, a previsão usa o maior prazo delas.
  Não distribui o mesmo estoque entre OSs diferentes; é uma previsão individual.
- Compra insuficiente, prazos ausentes/vencidos, unidades divergentes, coleta
  incompleta ou estoque desconhecido resultam em **A confirmar**, com a causa.
- Componentes já retornados, visitas encerradas e registros reconciliados não
  atrasam a previsão. OSs concluídas sem operação pendente não ganham nova data.

O cálculo usa a data corrente de Brasília e é refeito ao carregar a programação.
