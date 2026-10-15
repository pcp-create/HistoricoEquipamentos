# Localização automática dos clientes

Importe `automations/n8n/clientes-localizacoes.json` no n8n. O fluxo possui gatilho
manual e agendamento a cada minuto. No nó **Atualizar localizações dos clientes**,
selecione uma credencial Header Auth:
- Name: `Authorization`
- Value: `Bearer TOKEN` — mesmo valor de `TASK_AUTOMATION_TOKEN` na Vercel, ou
  `PREVENTIVE_REPORT_TOKEN` se o primeiro não estiver configurado.

A chave `GEOAPIFY_API_KEY` permanece exclusivamente na Vercel. O fluxo chama
`POST https://rjcompressores.app/api/localities/automation`; não modifica tarefas
nem envia mensagens. Execute o teste manual e publique/ative o fluxo no n8n.
O JSON não contém segredos nem IDs de credenciais de outra instalação.

A resposta apresenta `updated`, `failed` e `skipped`. `updated: 0` pode significar
que não há posições pendentes elegíveis. `failed` contabiliza endereços que não
puderam ser localizados e serão tentados novamente após uma hora. Erros de
credencial retornam 401; falta da chave ou da migração retorna 503.

Cada execução processa até três endereços dentro de 45 segundos. A busca inclui
todos os endereços ativos da empresa 1, priorizando clientes com OSs na programação.
A carga antiga é progressiva. Endereços novos ou alterados são detectados nos ciclos
seguintes à sincronização. Coordenadas válidas e ajustes manuais são preservados.
O mapa apenas consulta posições salvas, sem disparar consultas ao provedor.

A migração de controle de tentativas já foi aplicada no banco atual. Para outra instalação,
execute dentro de `web`:
```
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-locality-geocoding.mts
```

Esta rotina é independente do fluxo de tarefas. Ela não roda até que o novo
workflow seja importado, receba a credencial e seja ativado no n8n.
