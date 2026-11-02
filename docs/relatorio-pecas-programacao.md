# Relatório de peças da programação

Acesso: **Programação de OSs → Relatório de peças** (`/programacao/pecas`).
Consulta autenticada, disponível para os mesmos usuários habilitados da programação.
Não executa alterações no ERP e não envia mensagens aos fornecedores ou à equipe.

## Conteúdo

- OSs ativas no módulo, independentemente dos filtros da lista, exceto processadas, canceladas ou excluídas (também nas OSs vinculadas).
- Indicadores de cobertura, linhas de peças, demanda e pendências.
- Consolidado por empresa, código e unidade: demanda a retirar, disponível,
  compra aberta, complemento sugerido, status, responsável e ação recomendada.
- Detalhamento por OS: cliente, equipamento, status ERP/programação, origem dos
  materiais, quantidades previstas, retiradas e utilizadas, estoque e disponível.
- Cada OC aberta aparece com código, fornecedor, saldo, unidade, status e chegada
  prevista. Prazos vencidos/ausentes ficam sinalizados.
- Datas das últimas coletas e avisos de integração incompleta.
- Impressão/PDF em A4 paisagem e Excel com cinco abas: Orientações, Consolidado,
  Peças por OS, Compras abertas e Cobertura OSs.

## Critérios

As quantidades retiradas são descontadas da demanda. Estoque e compras são
contados uma única vez por empresa, peça e unidade no consolidado. O mesmo saldo
pode aparecer em várias OSs no detalhe apenas como contexto, não como reserva.
Não é feita alocação automática entre OSs ou promessa de disponibilidade exclusiva.

Materiais excluídos/não aprovados, espelhados na OS principal e de programações
concluídas são informativos e não geram compra. OSs processadas, canceladas e excluídas não aparecem em nenhuma seção ou aba do Excel.
Divergências entre materiais da OS principal e vinculada exigem conferência.

A sugestão de complemento exige estoque e coleta de compras confirmados. Dados
incompletos resultam em orientação de conferência, não em quantidade de compra
presumida. Reservas, prioridades e entrega física devem ser validadas pelas equipes.
