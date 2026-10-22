# Orçamentos do M8

## Interface

CRM → Orçamentos (`/orcamentos`) consulta as três empresas (1 RJ Industria, 2 Serrana, 27404 Criciúma), com pesquisa geral, filtros por empresa/proposta/cliente/descrição/status/situação/tipo/período/produto/vendedor, paginação, CSV e detalhe com produtos, serviços e vendedores.

O botão **+ Novo Orçamento** abre a tela existente em `/orcamentos/novo`. Rascunhos, anexos e propostas locais permanecem nas tabelas anteriores; não são mesclados automaticamente aos dados do M8. Links antigos `/orcamentos?id=<UUID>` redirecionam para o editor. A consulta `/historico` passou a se chamar **Ordens de Serviço**, exclusivamente no módulo Assistência Técnica.

## Integração

Migration `016_m8_quotes.sql`: `m8_quotes` e `m8_quote_items`, chaves compostas por empresa e ID, payloads originais preservados, RLS e acesso direto público revogado.

`npm run sync:quotes` consulta `/v1/crm/orcamento?Page=0&PageSize=0` em cada empresa. Novos e alterados entram na fila. Datas de emissão/validade são datas civis do payload, sem conversão que mude o dia. Os três endpoints filhos são consultados por ID e gravados em transação; se qualquer um falhar, o snapshot anterior é preservado. Ausência na listagem não exclui um orçamento.

Cada ciclo importa até 20 detalhes por empresa (`M8_QUOTES_DETAIL_BATCH`, 1–500). Reconsulta detalhes após 24 horas mesmo sem alteração no cabeçalho, pois os filhos não têm um marcador de atualização documentado. Pendências novas têm prioridade; falhas aguardam cinco minutos. Uma carga inicial grande exige vários ciclos. A tela sinaliza detalhes ainda não importados ou desatualizados.

O timer é de um minuto. Lock por empresa impede sobreposição. Uma execução que exceda um minuto pode atrasar a seguinte; o horário real da última consulta aparece na tela. A interface relê a base a cada minuto enquanto visível; isso não substitui o integrador no servidor.

## Instalação no servidor do integrador

Atualize os arquivos do projeto no `/opt/m8-integrador` conforme o procedimento habitual, preservando `.env` e certificados. Este repositório não contém credenciais do servidor. Na pasta do projeto:

```sh
sudo -u m8-integrador npm ci
sudo -u m8-integrador npm run build
sudo -u m8-integrador npm run db:migrate
install -m 644 deploy/systemd/m8-orcamentos.service /etc/systemd/system/
install -m 644 deploy/systemd/m8-orcamentos.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now m8-orcamentos.timer
systemctl start --no-block m8-orcamentos.service
systemctl list-timers --all m8-orcamentos.timer
journalctl -u m8-orcamentos.service -n 30 --no-pager
```

Não é necessário parar os outros integradores para habilitar este serviço. Ao substituir arquivos compartilhados, utilize o procedimento de manutenção já adotado pelo servidor. A migration já foi aplicada no banco configurado durante a implementação; o executor reconhece a aplicação anterior.

```sql
SELECT company_id,count(*) AS orcamentos,
 count(*) FILTER(WHERE detail_at IS NOT NULL) AS com_detalhes,
 count(*) FILTER(WHERE pending) AS pendentes,
 max(collected_at) AS ultima_consulta
FROM m8_quotes GROUP BY company_id ORDER BY company_id;
```
