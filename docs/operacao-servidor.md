# Operação no servidor da empresa

O fluxo principal é `sync:cycle`: uma listagem resumida por empresa, gravação dos cabeçalhos em lotes de 100 e coleta dos filhos das OS pendentes. O usuário concluiu a instalação no Ubuntu com systemd em 11/09/2026 e forneceu logs confirmando gravações das três empresas. O serviço é `m8-integrador.service`; o timer executa uma hora após o término do ciclo anterior.

## Preparação

1. Disponibilizar Node.js compatível com `package.json`, npm e conectividade HTTPS com M8 e PostgreSQL com Supabase.
2. Copiar o projeto, instalar com `npm ci` e executar `npm run build`.
3. Criar `.env` privado, com as variáveis de `.env.example`, incluindo `M8_COMPANIES=1,2,27404`, `DATABASE_URL`, `M8_TIME_ZONE=America/Sao_Paulo` e `DATABASE_SSL_CA_FILE` apontando para o certificado CA. Senhas com caracteres reservados na URI precisam de percent-encoding.
4. Configurar o diretório de trabalho para a raiz do projeto: `.env` e o caminho relativo do certificado são resolvidos a partir dele.
5. Aplicar `npm run db:migrate`. Migrations já aplicadas são reconhecidas pelo checksum.

## Comandos

```bash
# Descobrir todas as OS, atualizar os cabeçalhos e processar até 100 detalhes por empresa
npm run sync:cycle -- --max-orders=100

# Processar toda a fila disponível do inventário atual; pode demorar horas
npm run sync:cycle

# Retomar somente a fila existente, sem consultar novamente o inventário
npm run sync:cycle -- --resume --max-orders=100

# Equivalente compilado para execução pelo runner
node dist/scripts/syncCycle.js --max-orders=100
```

`--max-orders` limita tentativas de detalhes por empresa, não a listagem dos cabeçalhos, e não é dry run. Cada detalhe normalmente exige duas leituras do cabeçalho e oito chamadas de coleções (produtos ativos/excluídos, serviços, equipamentos, manutenções, apontamentos, checklist e anexos). Existe uma chamada HTTP em andamento por empresa; as três empresas são independentes.

Para atualização recorrente, usar o comando normal (sem `--resume`) no agendador já utilizado pelo servidor, inicialmente a cada hora. Ajustar tamanho do lote e intervalo após medir duração/pendências. `--resume` é útil para drenar uma carga interrompida, mas não descobre novas OS nem recoloca OS abertas já revisadas na fila. Não iniciar o runner antigo por faixa de IDs em paralelo.

Locks PostgreSQL por empresa impedem sobreposição de execuções. Um processo concorrente não obtém o lock e retorna erro. `SIGINT`/`SIGTERM` solicitam parada após a OS atual; uma queda abrupta preserva os cabeçalhos e a fila, e a transação impede finalizar parcialmente uma OS. A próxima execução pode repetir a coleta por segurança.

## Regra de atualização

- OS nova, mesmo `Processado`: todos os filhos devem ser importados antes de finalizar.
- OS ainda não finalizada: revisada no ciclo seguinte. `Pendente`, `Aprovado` e `Cancelado` não são considerados imutáveis.
- OS `Processado` antes e depois da coleta, sem mudança de dataAtualizacao: somente após o commit de todos os filhos recebe `finalized=true`.
- Se mudar de status ou dataAtualizacao durante a coleta, fica pendente para nova revisão, com espera mínima de um minuto.
- OS já finalizada e novamente listada como `Processado`: cabeçalho atualizado, filhos não reconsultados.
- Se uma OS finalizada voltar com outro status, a fila é reaberta conservadoramente.
- OS ausente da próxima listagem e filhos ausentes de respostas não são apagados automaticamente.

Filhos são buscados nos endpoints separados com Page=0/PageSize=0, **sempre no contexto de uma única OS existente**. Esse comportamento foi validado em amostras; não é uma chamada completa de todas as OS. Há limite de 5.000 registros por resposta de coleção, timeout e limite de corpo HTTP de 64 MiB (`M8_MAX_RESPONSE_MB` configurável). Exceder limites interrompe a OS com erro; não trunca resultados nem marca finalização.

Falha em uma coleção mantém a OS pendente e registra a etapa em `collections`. `COLETADO` significa resposta recebida, não commit: somente `CONCLUIDO` indica persistência. A tentativa seguinte refaz a coleta inteira da OS para manter consistência, após 30 minutos. Três falhas consecutivas interrompem o processamento daquela empresa na execução. O comando retorna erro se houver falhas. Não existe avanço do checkpoint temporal legado: este fluxo usa estado por OS.

## Banco e acompanhamento

Execute `npm run sync:status` para obter as contagens atuais sem consultar dados de clientes. O worker deste workspace foi parado antes da ativação no servidor. Os arquivos `.m8/collection-cycle.log` e `.m8/collection-cycle.pid` são históricos dessa execução. No servidor, consultar `journalctl -u m8-integrador.service`.

```sql
SELECT company_id, count(*) AS ordens,
       count(*) FILTER (WHERE pending) AS pendentes,
       count(*) FILTER (WHERE finalized) AS finalizadas,
       count(*) FILTER (WHERE error IS NOT NULL) AS com_erro
FROM public.integracao_m8_os_sync
GROUP BY company_id ORDER BY company_id;

SELECT company_id, ordem_servico_id, error, collections, next_attempt_at
FROM public.integracao_m8_os_sync
WHERE error IS NOT NULL ORDER BY last_attempt_at DESC;
```

Cabeçalho existente no banco não implica que os filhos já foram importados. As views históricas podem mostrar dados parciais durante a primeira carga; consulte `integracao_m8_os_sync` para distinguir pendências. `finalized=false,pending=false` indica uma OS não terminal cujos filhos foram atualizados neste ciclo; ela será reenfileirada no inventário seguinte.

- `m8_os_documentos_fiscais` preserva os vários documentos retornados para a mesma OS. A coluna singular `documento_fiscal_id` fica nula quando há vários na resposta.
- `m8_os_manutencoes` é a tabela relacional para a coleção retornada pelo endpoint separado. A tabela singular legada permanece preservada, sem exclusão ou migração presumida de identidades.
- Horímetros são texto, conforme o contrato real; valores não numéricos são preservados.
- Produtos excluídos são consultados explicitamente, persistidos com `esta_excluido=true` e omitidos das views operacionais.

Logs não contêm senhas, tokens ou dados de clientes. Configure rotação/retenção de logs no runner para evitar crescimento contínuo. O JSON de auditoria no banco mantém o último estado disponível; não é um versionamento completo de todas as alterações. Na consolidação de cabeçalhos duplicados, a única divergência aceita é documentoFiscalId, preservada na tabela associada. Outras divergências bloqueiam a ingestão para análise.

## Descoberta rápida de novas OSs

A partir desta alteração, o ciclo completo continua no agendamento existente e uma
rotina independente consulta apenas os cabeçalhos a cada 30 segundos.
Ela insere somente OSs ainda ausentes e coloca seus detalhes na fila normal.
Não altera cabeçalhos existentes, não apaga registros e não espera o lock do ciclo
completo. A OS aparece na lista antes de produtos, serviços e anexos terminarem a coleta.

Meta: aparecer em até um minuto em condições normais. Não é garantia quando o M8,
a rede ou o banco estão indisponíveis/lentos. A consulta resumida medida em 19/10/2026
levou aproximadamente 16 s, 5 s e 3 s para as empresas 1, 2 e 27404.
A rotina consulta as empresas em paralelo e usa uma única conexão de banco.

No servidor, depois de atualizar o código e compilar:
```bash
cd /opt/m8-integrador
npm ci
npm run build
sudo install -m 644 deploy/systemd/m8-novas-os.service /etc/systemd/system/
sudo install -m 644 deploy/systemd/m8-novas-os.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now m8-novas-os.timer
sudo systemctl start m8-novas-os.service
sudo journalctl -u m8-novas-os.service -n 30 --no-pager
sudo systemctl list-timers m8-novas-os.timer --no-pager
```

Não substituir a configuração privada `.env`. O ciclo completo em execução não
precisa ser interrompido. Os logs NOVAS_OS informam quantidade de novas OSs e duração.
Para desativar apenas a coleta rápida: `sudo systemctl disable --now m8-novas-os.timer`.
