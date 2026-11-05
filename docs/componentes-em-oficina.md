# Componentes de máquinas em oficina

A entrada permite selecionar “Máquina / equipamento completo” ou “Componente de máquina / equipamento”. Para componente, selecione o nome na lista e a máquina cadastrada à qual ele pertence. A máquina é obrigatória; não há associação por aproximação de descrição ou série. É possível registrar vários componentes e manter uma entrada separada da máquina completa.

O seletor “Máquinas / equipamentos” / “Componentes de máquinas” separa os controles, indicadores, lista, kanban, movimentações e histórico. Componentes usam o mesmo fluxo de etapas, previsão, observações, transferência entre oficinas, envio externo e saída. A saída de um componente encerra apenas sua entrada e mantém as demais abertas. Os valores das OSs continuam sendo referências da máquina vinculada, sem criar faturamento adicional por componente.

Todos os usuários ativos podem cadastrar nomes na lista. Apenas administradores podem alterar ou excluir nomes, com verificação no servidor. Exclusões desativam o nome para novas seleções; entradas anteriores preservam o nome, autor e histórico registrados. Não são apagados componentes em atendimento nem registros históricos.

Na projeção de vendas, a coluna de oficina distingue “Sim”, “Somente componente” e “Não”. Sob o equipamento aparecem os nomes dos componentes em oficina e seus locais. A associação usa os vínculos explícitos da OS e sua empresa; saída ou estorno retira a indicação. Uma entrada de componente não sinaliza a máquina completa como fisicamente em oficina nos controles de equipamentos, locação e programação.

Antes de publicar:

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-workshop-components.mts
```

A migração 099 cria o catálogo de componentes e ajusta a restrição de entrada única para abranger somente máquinas completas. Vínculos dos componentes ficam no documento de origem da entrada; todos os registros existentes continuam sendo máquinas completas. Não exige novo APK.
