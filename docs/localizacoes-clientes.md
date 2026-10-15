# Localização automática dos clientes

O mapa consulta somente coordenadas persistidas. Abrir a tela, filtrar ou trocar
as visões não dispara consultas ao provedor. A correção manual continua disponível.

Com GEOAPIFY_API_KEY na Vercel, cada chamada autenticada `action: sync` a
`/api/tasks/automation` agenda uma verificação após responder ao n8n. O workflow
existente de sincronização deve permanecer ativo e apontar para
`https://rjcompressores.app`. Não precisa de outro nó nem de expor a chave no n8n.

Cada execução processa até três endereços, respeitando o limite de tempo da função.
A busca inclui todos os endereços ativos da empresa 1, priorizando clientes com
OSs na programação, sem depender de abrir o mapa.
Endereços novos ou alterados são localizados nos ciclos seguintes à sincronização;
a carga antiga é preenchida progressivamente. Coordenadas válidas são preservadas,
inclusive ajustes manuais. Alteração do endereço invalida as coordenadas anteriores.
Falhas aguardam uma hora antes da próxima tentativa; execuções concorrentes não
reclamam o mesmo endereço. Coordenadas não são gravadas se o endereço mudar durante
a consulta. O mapa ainda pode mostrar posições pendentes durante a carga inicial
ou quando o provedor não localizar um endereço.

Antes da publicação, aplicar em `web`:
```
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-locality-geocoding.mts
```

Logs da Vercel: `LOCALITY_GEOCODING` contém contagens, sem chaves ou endereços.
`LOCALITY_GEOCODING_DEFERRED` indica falha temporária; o ciclo seguinte tenta de novo.
