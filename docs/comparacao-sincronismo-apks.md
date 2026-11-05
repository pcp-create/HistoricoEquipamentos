# Comparação do sincronismo dos APKs

Revisão de 05/11/2026: controle-de-despesas-rj em `ce63e34`, comparado ao
HistoricoEquipamentos em `911aa23`. O projeto de despesas foi consultado, sem alterações.

Ambos mantêm fila local, recibos para evitar duplicações, tentativa ao retomar
o aplicativo ou voltar a conexão e verificação periódica a cada 30 segundos.
Despesas usa Capacitor Network/App, IndexedDB e bloqueio de execução concorrente;
OS usa ConnectivityManager, eventos do WebView, SQLite e uma promessa única de envio.
O sistema de despesas já diferencia falhas temporárias e bloqueios, com espera
progressiva de 2 segundos até 5 minutos. Sua fila só busca o anexo ao enviá-lo.

## Ajustes no portal técnico

- O telefone com internet e sem acesso ao servidor passa a mostrar **Internet disponível · sem acesso ao sistema**, em amarelo. Antes podia continuar verde.
- Falhas temporárias de rede, HTTP 408/429/5xx e confirmações inválidas recebem nova tentativa no APK a partir de 2 segundos, aumentando até 30 segundos. Conflitos de validação continuam visíveis e não entram nessa repetição rápida.
- Verificações sem pendências não baixam cada operação da programação.
- Se houver novo apontamento durante a atualização da programação, ele é enviado antes dos downloads seguintes. Uma requisição já em andamento ainda precisa terminar ou atingir seu timeout.
- O status da fila consulta metadados, sem decodificar fotos via ponte nativa. Atualizações visuais e recargas da tela são agrupadas.

Preservados: gravação atômica, isolamento por conta, dependências da fila, horários
originais, recibos e confirmação antes da remoção local. Não foi implementado serviço
permanente em segundo plano. Android pode suspender o app; ao reabrir, o envio retoma.

A demora específica do aparelho não pode ser atribuída a uma única causa sem seus
logs. As alterações corrigem gargalos comprovados no código e testados com filas
simuladas, falhas de servidor e interface empacotada. Exigem APK 2.2.14.
