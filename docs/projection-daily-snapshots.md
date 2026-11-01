# Projeção: Diário às 23h30 e fechamento mensal

## Regra

Todos os dias, inclusive fins de semana, a automação registra uma fotografia às **23h30 de Brasília**, das três empresas e da competência do **próprio dia**. Exemplo: 31/10 às 23h30 registra outubro. O nome da parcial é **Diário · DD/MM/AAAA**, com autor **Automação diária**.

São feitas novas tentativas às 23h40 e 23h50. A janela aceita pelo endpoint é 23h30–23h59. Fora dela, retorna `state: waiting`, sem gravar. Repetições e chamadas simultâneas não duplicam nem substituem a fotografia do dia. A integração precisa estar completa e OSs/dados comerciais atualizados nas últimas duas horas. Falha retorna 503, sem consumir o dia. Não são inventadas capturas retroativas.

Ao consultar uma competência encerrada, o **valor projetado por empresa** é preservado da última parcial elegível daquele mês. O fechamento é guardado separadamente, com proteção contra alterações comuns, e permanece mesmo se a parcial original for excluída por um administrador. O faturamento real e os documentos continuam refletindo a base integrada. Para competências encerradas, **A faturar = máximo entre zero e (projeção de fechamento − faturado líquido)** por empresa; o total soma esses saldos. Esse valor representa o saldo da projeção, e não uma lista de OSs ainda pendentes no ERP; a tela identifica a parcial usada para a projeção. A escolha de outra parcial para comparação não altera o fechamento.

Capturas manuais feitas depois do término do mês não substituem a projeção de fechamento. As antigas capturas automáticas feitas à meia-noite do dia seguinte podem ser reconhecidas pelo dia registrado no controle diário. Se não houver uma parcial elegível, a tela informa que não há fotografia para congelar; não registra o cálculo de hoje como se fosse histórico.

Nos cards, **A faturar** aparece depois da diferença para a meta. Em competências passadas, **A buscar da meta** passa a se chamar **Diferença para a meta**.

## Diagnóstico em 01/11/2026

O banco não tinha nenhum registro no controle de parciais automáticas, e o usuário confirmou que o workflow não havia sido ativado. O endpoint estava publicado e respondia exigindo autenticação. Ter a migration e o arquivo JSON no projeto não ativa um agendamento no n8n.

Outubro tinha uma parcial manual em 31/10 às 10h54 de Brasília, chamada `Diario`, com projeção total de R$ 1.478.041,08. O print posterior mostra R$ 1.496.422,68, mas não há uma parcial armazenada desse momento. O sistema usa a última fotografia realmente salva; não recria o valor do print com dados atuais.

## Publicar a aplicação

No ambiente da aplicação web, com `web/.env.local` configurado:

```bash
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-projection-daily.mts
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-projection-closures.mts
```

A primeira migration (`089`) é reaproveitada, sem alteração de checksum. A nova migration é `091_projection_month_closures.sql`. Publique a versão atualizada da aplicação após preparar o banco.

Não execute esses comandos em `/opt/m8-integrador`: o pacote do integrador não contém a aplicação web. Não é necessária outra atualização do integrador para esta alteração.

## Ativar no n8n

1. Baixe `automations/n8n/projecao-parcial-diaria.json` atualizado.
2. No n8n, importe por **Import from File**. Se houver uma versão antiga desse workflow, mantenha apenas a versão nova ativa.
3. Abra o nó **Registrar parcial diária**.
4. Selecione a mesma credencial **Header Auth** usada nas outras automações: nome `Authorization`, valor `Bearer ` seguido da chave `TASK_AUTOMATION_TOKEN` configurada na aplicação. Não use a chave da Evolution. Não insira a chave no JSON nem no repositório.
5. Confirme a URL `https://rjcompressores.app/api/sales-projection/snapshots/automation`, método **POST**.
6. Salve e **ative/publique o workflow**. O timezone está configurado como `America/Sao_Paulo`; o cron é `30,40,50 23 * * *`.
7. Confirme em **Executions** a execução às 23h30. Sucesso retorna `state: created`; as novas tentativas retornam `state: exists` com o mesmo ID.

O arquivo é entregue desativado porque precisa receber a credencial do seu n8n. A ativação é uma etapa real necessária e não foi executada pelo código do projeto.

Para testar a credencial sem gravar, duplique temporariamente o nó HTTP e use **GET** na mesma URL, sem alterar o POST do workflow. A resposta deve indicar `authenticated: true`. Um teste manual do POST antes das 23h30 retorna `waiting`, o que é esperado. `401` indica credencial ausente/incorreta; `503` exige conferir a mensagem e a atualização da integração.

## Conferir o registro

Na aplicação, abra a competência e a lista **Parcial de referência**. Deve aparecer **Diário · DD/MM/AAAA**. O registro não depende de alguém manter a tela aberta. Capturas manuais continuam disponíveis e não consomem a cota da automação.

Se um administrador excluir a parcial diária, o controle do dia permanece, impedindo recriação automática. Se o fechamento mensal já foi preservado, ele também permanece. Parciais anteriores não são alteradas.

## Resposta `waiting` e verificação da versão publicada

`ok: true` indica que a chamada foi aceita, não que uma fotografia foi gravada. `state: waiting` significa que o horário de captura ainda não chegou. O retorno atualizado inclui `recorded: false`, mensagem explícita, timezone e horário agendado. Para registrar fora da janela automática, utilize **Registrar parcial agora** na aplicação.

Uma resposta com `hour: 0` pertence à configuração antiga de meia-noite. Após publicar a aplicação atualizada, repita o GET autenticado no n8n: deve retornar `version: daily-23:30` e `schedule` com `hour: 23`, `minute: 30`, `timeZone: America/Sao_Paulo`. Não precisa enviar corpo no POST. Ativar apenas o workflow de 23h30 sem publicar o endpoint correspondente não atualiza a regra do servidor.

## Correção autorizada do fechamento de outubro/2026

Em 01/11/2026, o usuário autorizou o total de **R$ 1.496.422,68** conforme print de 31/10. O recálculo com data de referência em 31/10 reproduziu exatamente o total, com RJ Indústria em R$ 1.123.528,38, RJ Serrana em R$ 216.607,26 e Criciúma Compressores em R$ 156.287,04. Esses valores foram usados sem rateio arbitrário.

Foi registrada uma nova parcial **Correção de fechamento · 10/2026**, com a data real do registro da correção. A parcial `Diario` original continua intacta. Não se trata de uma fotografia automática retroativa.

A migration `092_projection_closure_corrections.sql` cria uma auditoria imutável contendo o fechamento anterior e o corrigido, autor, justificativa e data. O fechamento só aceita correção quando a transação referencia uma auditoria que corresponda exatamente aos registros anterior e novo. Alterações comuns e exclusões continuam bloqueadas.

Preparação da auditoria, no ambiente web (já aplicada ao banco conectado):

```bash
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-projection-closure-corrections.mts
```

A ferramenta administrativa `scripts/correct-projection-closure.mts` exige competência, total autorizado com ponto decimal, autor e justificativa. Confere se o recálculo por empresa coincide exatamente com o total e aborta sem gravar se houver divergência. Não é acionada pela automação diária. Para o fechamento corrigido, a tela passa a identificar a correção e sua data, sem atribuí-la à captura de 31/10.

Com o fechamento corrigido de outubro em R$ 1.496.422,68 e faturamento líquido em R$ 1.488.525,86, o saldo exibido em A faturar é R$ 7.896,82: RJ Indústria R$ 4.852,26; RJ Serrana R$ 0,00; Criciúma Compressores R$ 3.044,56. Meses abertos mantêm a regra de contratos e vendas pendentes.
