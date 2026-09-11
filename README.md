# Histórico de equipamentos — M8

Integrador backend Node.js/TypeScript e site Next.js para **M8 → PostgreSQL/Supabase → consulta de histórico / Power BI**. Nenhum consumidor consulta a M8 diretamente.

O site está em [`web/`](web/README.md): login individual, pesquisa global em OS/materiais/equipamentos, filtros, detalhes e CSV. Para desenvolvimento: `npm --prefix web ci` e `npm run web:dev`. A publicação Vercel usa Root Directory `web` e depende das variáveis e da conta de acesso descritas no guia.

**Estado:** fluxo principal alterado para **listagem resumida + endpoints separados dos filhos**. A migration 005 foi aplicada, os cabeçalhos de **12.650 OS** foram gravados e o lote real de duas OS por empresa concluiu todas as coleções sem erro. O estado final exige `Processado` confirmado antes/depois da coleta e commit de todos os filhos. A carga por faixa de IDs foi substituída pela fila de IDs reais. O usuário instalou e validou o serviço `m8-integrador` no servidor Ubuntu com systemd em 11/09/2026, com novo ciclo uma hora após o término do anterior. A carga inicial de detalhes continua em andamento.

## Fluxo principal atual

```bash
npm run sync:cycle -- --max-orders=100   # inventário completo + lote de detalhes por empresa
npm run sync:cycle -- --resume          # drenar somente a fila existente
npm run sync:status                     # contagens de pendentes, finalizadas e erros
```

Ver [operação no servidor](docs/operacao-servidor.md) para regras, retomada, configuração e monitoramento. A nova rotina não depende do limite manual de ID nem da paginação de OS completas. A listagem global resumida e as coleções de **uma única OS** usam Page=0/PageSize=0, conforme os testes reais e autorização do usuário. Não há chamada global de `ordemservicocompleta` neste fluxo.

Produtos são consultados com `EstaExcluido=false` **e** `true`; equipamentos/manutenções são listas; checklist usa o GET `checklistpergunta` (nota/observação fazem parte de sua resposta). A documentação não fornece GET em `checklistresposta`, que é um endpoint de envio. Nenhuma escrita é feita na M8.

Migrations adicionais do fluxo: `005_m8_collection_cycle.sql` cria `integracao_m8_os_sync`, `m8_os_manutencoes` e `m8_os_documentos_fiscais`; horímetros passam a texto conforme o contrato real. IDs repetidos no inventário variam somente em documentoFiscalId: todos são preservados em tabela associada. Outras divergências não são resolvidas silenciosamente.

As seções abaixo também documentam os modos anteriores (paginação e varredura por faixa), mantidos para consulta/compatibilidade. Eles não são o fluxo principal nem devem ser executados em paralelo com `sync:cycle`.

## Configuração inicial

Requer Node.js 22+ e npm. Execute na raiz do projeto:

```bash
npm install
cp .env.example .env
```

Preencha o `.env` no ambiente privado do integrador. `.env`, `.env.*`, certificados, `.vercel`, logs e dependências são ignorados pelo Git. Nunca use prefixo `NEXT_PUBLIC_` nas credenciais do backend.

| Variável | Uso |
| --- | --- |
| `M8_API_URL` | Nome já existente na Vercel: `https://api.integra.m8sistemas.com.br` |
| `M8_BASE_URL` | Alias opcional; se ambos forem definidos, devem coincidir |
| `M8_TENANT`, `M8_USERNAME`, `M8_PASSWORD` | Credenciais M8 obrigatórias |
| `M8_DOMAIN` | Padrão `app.erpm8.cloud` |
| `M8_COMPANIES` | **Definir `1,2,27404`**, com precedência sobre `M8_COMPANY` |
| `M8_COMPANY` | Compatibilidade legada; aceita um ID ou lista. Se for `1` e `M8_COMPANIES` estiver ausente, somente a empresa 1 será consultada |
| `M8_TOKEN_PATH` | Caminho do token no JSON; `data.token` confirmado nas três empresas |
| `M8_TIME_ZONE` | Datas locais da M8: padrão `America/Sao_Paulo` (horário de Brasília); ajustável por fuso IANA |
| `M8_TIMEOUT_MS`, `M8_MAX_ATTEMPTS` | Padrões 30000 ms e 4 tentativas por requisição, incluindo autenticação |
| `M8_PAGE_SIZE` | Padrão/máximo 500; nunca zero |
| `M8_PAGINATION_VALIDATED` | `false` até validar contrato e paginação nas três empresas; `true` libera modos completos |
| `DATABASE_URL` | URI PostgreSQL privada, obtida em Supabase → Connect |
| `DATABASE_SSL_CA_FILE` | Caminho opcional do certificado CA do Supabase; TLS verifica certificado |
| `DATABASE_SSL_DISABLED` | Apenas `true` para PostgreSQL em localhost; padrão `false` |
| `INITIAL_SYNC_START_DATE` | Padrão `2020-01-01`; ajustar para cobrir o histórico desejado |
| `INITIAL_SYNC_WINDOW_MONTHS` | Padrão 1, janelas mensais |
| `INITIAL_SYNC_DATE_FIELD` | `atualizacao` (padrão) ou `emissao`, após validação histórica |
| `SYNC_OVERLAP_MINUTES` | Padrão 10 minutos |
| `SYNC_MAX_PAGES` | Limite por empresa, somando todas as janelas, exclusivo de teste; nunca avança checkpoint |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Reservadas para uso futuro; não utilizadas pelo integrador PostgreSQL |

A URL e a chave `anon` fornecidas não substituem a senha PostgreSQL. Esta implementação usa `pg` e `DATABASE_URL`, sem precisar de `SUPABASE_SERVICE_ROLE_KEY`. Isso permite gravar OS, filhos e contadores de página na mesma transação, usando a mesma conexão, conforme a [documentação do node-postgres](https://node-postgres.com/features/transactions).

No Supabase, copie a conexão **direta** ou **Session pooler (porta 5432)**. Em redes somente IPv4, use Session pooler. **Não use Transaction pooler (porta 6543)**: o lock entre execuções é de sessão. Remova parâmetros `ssl*` da URI, pois o integrador configura TLS com verificação de certificado. Codifique caracteres reservados da senha na URI. Veja as [opções oficiais de conexão do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Vercel e execução do integrador

As variáveis cadastradas na Vercel não são automaticamente disponibilizadas neste workspace ou no seu terminal. Configure-as também no ambiente onde os comandos npm serão executados. Se usar a [CLI da Vercel](https://vercel.com/docs/cli/env) com sua conta autenticada e este projeto vinculado, `vercel env pull .env` pode exportar as variáveis do ambiente Development; confira o ambiente selecionado e não versione o arquivo. Adicione `M8_COMPANIES=1,2,27404` e `DATABASE_URL`. A indicação “Needs Attention” de `M8_PASSWORD` na captura precisa ser conferida no painel; a imagem não permite determinar a causa.

Este projeto é um **worker CLI**, sem página web ou endpoint público. Não execute sincronizações em `build` nem no build da Vercel. O build só compila TypeScript. Para cargas extensas, execute o CLI em processo Node persistente (servidor, VPS ou runner), com as variáveis configuradas ali. A Vercel pode hospedar o futuro frontend. Nenhum agendamento/infraestrutura externa foi criado.

## Ordem para ativar

```bash
# 1. Testar autenticação e Page=1/PageSize=1 em todas as empresas
npm run m8:test

# 2. Validar páginas 1 e 2 com cinco registros e sondar a origem da paginação
npm run m8:test:pagination

# 3. Após validação do contrato, aplicar a migration no banco configurado
npm run db:migrate

# 4. Importação pequena REAL (não é dry run); máximo padrão de duas páginas por empresa
npm run sync:test -- --from=2026-09-01 --to=2026-09-10

# 5. Após os testes de docs/validacao-m8.md, definir M8_PAGINATION_VALIDATED=true
npm run sync:initial
npm run sync:incremental

# 6. Reconciliação, sempre sem alterar o checkpoint
npm run sync:reprocess -- --from=2026-09-01 --to=2026-09-10
```

`db:migrate` aplica as migrations `001_m8_history.sql`, `002_m8_observed_types.sql`, `003_m8_id_scan.sql` `004_m8_approval_mixed.sql` e `005_m8_collection_cycle.sql`, nessa ordem, cada uma em transação com checksum. A segunda adequa quatro colunas aos tipos observados na API, preservando valores originais do payload; dados legados incompatíveis causam erro em vez de conversão inventada. Reexecutar não aplica duas vezes; editar uma migration aplicada causa erro. Para usar o SQL Editor, execute o arquivo inteiro em uma transação. Não alterne SQL Editor e o runner para a mesma migration sem registrar/reconciliar o histórico de migrations. Migrations futuras devem ser adicionadas ao runner (esta versão tem cinco migrations explícitas).

`sync:test` grava dados, marca execução como `LIMITADO` e não cria/avança baseline, mesmo que encontre o fim da janela. `SYNC_MAX_PAGES` também força `LIMITADO` em qualquer modo. Retire esse limite antes da carga de produção. `sync:incremental` recusa empresas sem carga inicial concluída. Datas `--to=YYYY-MM-DD` incluem o dia inteiro até 23:59:59.999 UTC; para outro fuso, passe data/hora ISO 8601 com offset explícito.

A carga inicial refaz o teste de comunicação das três empresas antes de persistir. `M8_PAGINATION_VALIDATED` é uma declaração operacional de validação, não prova automática de que a API não mudou.

## Autenticação e HTTP

Cada empresa tem seu próprio cliente/token. `POST /v1/auth/token` envia JSON com `tenant`, `username`, `password`, `company` (inteiro) e `domain`. Consultas usam `Authorization: Bearer TOKEN` em `GET /v1/assistenciatecnica/ordemservicocompleta`.

O token é reutilizado, renovado aos cinco minutos ou antes conforme `exp` do JWT. Não existe refresh fictício: toda renovação repete o POST. Uma Promise compartilhada por cliente impede autenticações simultâneas; um 401 atrasado não invalida token novo. Em 401 há uma única renovação/repetição da mesma URL/página; outro 401 falha sem reiniciar a carga. A autenticação concorrente é controlada no processo; o lock PostgreSQL impede sincronizações simultâneas da mesma empresa entre processos.

429, 500, 502, 503, 504, timeout e falhas de conexão têm tentativas limitadas com backoff/jitter. `Retry-After` em segundos ou data é respeitado até 120 segundos; valores maiores interrompem para reexecução posterior. O timeout cobre leitura do corpo. Redirecionamentos HTTP são recusados. Logs mostram empresa, endpoint, página, status HTTP e tentativa, sem resposta bruta, senha ou token. Erros PostgreSQL não expõem `detail`/registros. A mensagem remota é deliberadamente omitida porque pode conter dados pessoais/credenciais; o diagnóstico se faz pela etapa, status e contrato documentado.

## Paginação, transações e checkpoint

A hipótese de paginação é `data[]`, páginas iniciadas em 1, término quando a quantidade é menor que PageSize (incluindo zero). Nenhum metadado de total é inventado. O teste compara o conjunto da página 1 de tamanho 10 com a união das páginas 1 e 2 de tamanho 5. Isso detecta uma segunda página vazia mesmo quando há mais registros. Se essa comparação passar, consulta 0 com tamanho 5 para determinar se 0 é rejeitado (400) ou equivalente a 1. Resultados diferentes ou amostra insuficiente bloqueiam a validação. O comportamento da página final precisa ser confirmado manualmente.

Cada página é persistida antes da próxima; somente a página atual, IDs da anterior e hashes compactos das páginas da janela são mantidos em memória. IDs repetidos na página ou sobrepostos entre páginas consecutivas provocam erro. OS + filhos + contadores de sucesso usam uma transação; falha em um filho reverte toda a página.

O limite final é capturado uma vez no início do processo, antes das três empresas. A carga inicial usa janelas mensais por atualização; limites entre janelas se sobrepõem exatamente para evitar lacunas. A alternativa por emissão existe, mas depende da validação histórica. Incremental começa no checkpoint da empresa menos dez minutos. A paginação por número não oferece um snapshot remoto: alterações concorrentes na M8 ainda podem deslocar resultados; sobreposição e reprocessamento reduzem esse risco.

O checkpoint avança **por empresa**, somente quando todas as janelas e páginas daquela empresa terminam. Não há um checkpoint único que masque empresas pendentes. Se 1 concluir e 2 falhar, 1 mantém seu avanço, 2 permanece no marcador anterior e 27404 ainda é processada. O processo termina com código diferente de zero se qualquer empresa falhar. Reprocessamentos/testes nunca avançam checkpoint. O marcador também não retrocede.

Um advisory lock PostgreSQL por empresa impede intercalar cargas/reprocessamentos. Queda do processo libera o lock; a próxima execução marca logs anteriores `EXECUTANDO` como erro de interrupção. Páginas previamente gravadas permanecem e são reaplicadas por UPSERT. Se o banco cair e não permitir registrar erro, o log pode ficar `EXECUTANDO` até a recuperação seguinte.

## Banco e decisões de modelagem

Migrations: [001_m8_history.sql](supabase/migrations/001_m8_history.sql) e [002_m8_observed_types.sql](supabase/migrations/002_m8_observed_types.sql).

| Tabela | Conteúdo/chave |
| --- | --- |
| `m8_ordens_servico` | Campos principais do briefing; PK `(company_id, id_m8)` |
| `m8_os_produtos` | Materiais, referências, quantidades, valores, impostos, exclusão lógica |
| `m8_os_servicos` | Serviços executados |
| `m8_os_apontamentos` | Apontamentos; `total_horas`, `hora_inicio` e `hora_fim` preservados como texto |
| `m8_equipamentos` | Observações de `equipamentoProduto` no contexto da OS; não é cadastro global presumido |
| `m8_checklist_respostas` | Respostas/checklist |
| `m8_anexos` | IDs/descrições; sem download |
| `m8_os_manutencao` | Objeto original JSONB por `(company_id, ordem_servico_id)`; estrutura interna pendente |
| `integracao_m8_log` | Empresa, modo, janela, página atual, contadores, status, duração, erro seguro |
| `integracao_m8_checkpoint` | Última janela concluída por empresa |
| `integracao_m8_migrations` | Controle do runner de migrations |

Todos os filhos identificados têm PK `(company_id, ordem_servico_id, id_m8)`. A origem aninhada permite FK para a OS com empresa; não criamos FKs presumidas para cadastros de cliente/produto/equipamento. `company_id` é o escopo da autenticação, enquanto `empresa_id` mantém o valor retornado na OS: não são substituídos nem presumidos iguais. IDs iguais entre empresas ficam separados.

Os campos previstos são colunas relacionais e o payload JSONB conserva campos adicionais. Campos ausentes preservam o valor anterior; `null` explícito limpa a coluna. Tipos/capitalização são provisórios, baseados no briefing: incompatibilidades interrompem a página. Datas do payload sem offset são interpretadas em `M8_TIME_ZONE=America/Sao_Paulo`, conforme a indicação do usuário de horário brasileiro (assumido Brasília), e convertidas para UTC. Offsets explícitos são preservados. O [Temporal](https://tc39.es/proposal-temporal/docs/zoneddatetime.html) aplica as regras históricas de horário de verão; horários ambíguos/inexistentes são recusados, sem deslocamento silencioso. O payload conserva o texto original. Essa configuração é da leitura do payload; datas da CLI e filtros continuam sendo instantes explícitos em UTC/offset, e a semântica do filtro remoto ainda precisa ser validada. Decimais em string são enviados ao PostgreSQL sem passar por `parseFloat`; valores que já vierem como número JSON estão sujeitos à precisão do JavaScript. IDs numéricos sem precisão são recusados.

A coleção `manutencao` não foi descrita: uma tabela própria conserva o objeto original, sem inventar atributos. Depois da amostragem real, criar migration com colunas relacionais. Cada tabela mantém `created_at`, `updated_at`, `sincronizado_em`. O payload é o último recebido; este modelo guarda o histórico de OS e filhos, **não todas as versões de cada alteração**.

Filhos ausentes não são apagados. `esta_excluido=true` permanece auditável; somente um valor explicitamente recebido altera essa flag. Não presumimos exclusão a partir de ausência. Se a API remover itens sem flag, as views poderão continuar exibindo o último estado conhecido até haver reconciliação validada.

Contadores `registros_inseridos/atualizados` referem-se a **OS**, não à soma de filhos. `paginas_processadas` conta páginas persistidas (inclusive terminal vazia); `pagina_atual` também registra a tentativa que pode ter falhado. Status adicionais `TESTE` e `LIMITADO` distinguem cargas controladas de sucesso completo.

## Views e índices

- `vw_historico_equipamentos`: OS com materiais ativos, incluindo OS sem materiais por LEFT JOIN.
- `vw_historico_materiais`: material → OS/cliente/equipamento.
- `vw_os_materiais`: OS + materiais ativos.

As três excluem produtos com `esta_excluido=true`; `NULL` é tratado como não marcado excluído. OS canceladas/inativas permanecem com seu status para o consumidor decidir. As views não juntam observações de equipamento, evitando multiplicação indevida de materiais; usam equipamento/modelo/série da OS. Dados complementares estão em `m8_equipamentos`.

Há **14 índices secundários**: log por empresa/data; OS por empresa/número, série, cliente, CPF/CNPJ, produto equipamento, empresa/atualização e empresa/emissão; produtos por produto, referência, similaridade e atualização; equipamentos por série e modelo. PKs já indexam empresa/OS nos filhos. Pesquisa textual por cliente/nome/descrição poderá ganhar `pg_trgm`/GIN ou full-text após medir consultas e volume; não adicionamos índices indiscriminados.

RLS está habilitada e sem policies públicas; tabelas/views revogam acesso `anon`/`authenticated`. Views usam `security_invoker`. O integrador conecta com um papel backend autorizado (o proprietário na configuração inicial). Antes de liberar Next.js, criar políticas de autenticação/acesso por empresa; antes do Power BI, criar papel somente leitura com grants/policies apropriados. Não fornecer a credencial de escrita do integrador a esses consumidores.

## Catálogo futuro

O catálogo do fabricante deve ser separado do histórico real. Estrutura proposta, ainda sem migration/importador por falta de amostra:

- `catalogo_pecas`: ID próprio, fabricante, código, descrição, referência fabricante/alternativa, unidade e observação.
- `catalogo_pecas_aplicacao`: ID próprio, FK para peça, fabricante/modelo/produto/equipamento, séries inicial/final e observação.

O cruzamento futuro usa referências e aplicação validada; não converter peças de manual em materiais usados em OS. Não foram criados frontend, importação de manuais nem agendamentos. Os comandos podem futuramente executar incremental horário, reprocessamento de 7 dias diário e de 90 dias semanal.

## Arquivos e validação local

```text
src/config/env.ts                   configuração e aliases
src/m8/{auth,client,ordemServico,types}.ts
src/database/{postgres,schema,ordensServico.repository,integracaoLog.repository}.ts
src/sync/syncOrdensServico.ts       orquestra os três modos sem duplicar lógica
src/utils/{dates,m8Dates,retry,logger}.ts
src/scripts/{testM8,migrate}.ts
src/index.ts                       CLI
supabase/migrations/{001_m8_history,002_m8_observed_types}.sql
tests/{m8,m8Dates,database}.test.ts
docs/validacao-m8.md
```

O repositório de OS centraliza os UPSERTs dos filhos com um schema estático compartilhado; não há repositórios vazios por coleção. Configuração adicional: `.env.example`, `.gitignore`, `package.json`, lockfile npm, `tsconfig*.json`, `eslint.config.js`. O único arquivo original modificado é este README.

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

Os testes usam transporte HTTP simulado e PostgreSQL via PGlite, executando as migrations reais. Cobrem isolamento de empresas, renovação/401/retry, configuração/datas, UPSERT, rollback, preservação de filhos, checkpoint, carga limitada, views, acesso anônimo negado, datas brasileiras com horário de verão e a inconsistência de paginação observada. Não substituem validação remota. O build gera `dist/`; por exemplo `node dist/index.js INCREMENTAL` mantém a execução independente do frontend.

Para validar o ambiente real, seguir [docs/validacao-m8.md](docs/validacao-m8.md). Sem `M8_TENANT`, o comando `m8:test` deve terminar com código 1 e informar apenas o nome da variável ausente.

## Carga por ID — alternativa à paginação

O usuário confirmou uma sequência global de IDs entre empresas e maior ID **14681**. O integrador consulta cada ID nas três empresas com `Id=N&Page=1&PageSize=2`, exigindo retorno vazio ou uma OS com exatamente o ID solicitado. Consulta cada escopo para preservar a origem sem inferir a empresa a partir do número; máximo de 44.043 consultas para o intervalo completo, além de autenticações/retries. Mantém uma chamada HTTP por empresa por vez, em três conexões independentes.

```bash
# Lote controlado; no máximo dez IDs adicionais por empresa, sem checkpoint temporal
npm run sync:ids -- --from-id=1 --to-id=14681 --max-ids=10

# Carga/retomada do intervalo completo
npm run sync:ids -- --from-id=1 --to-id=14681
```

A migration `003_m8_id_scan.sql` cria `integracao_m8_id_scan`. A posição é salva após gravar a OS e filhos; um crash entre a gravação e o cursor pode repetir um UPSERT, mas não pula uma OS não gravada. IDs vazios também avançam o cursor. Erros param aquela empresa no ID pendente; as demais continuam. `SIGINT`/`SIGTERM` solicitam pausa entre IDs.

Executar o mesmo intervalo retoma de onde parou. Intervalo já concluído não é reprocessado por esse comando. Para uma nova reconciliação completa, será necessário um novo ciclo de varredura, não apenas aumentar o limite para buscar OS novas. Buscar apenas novos IDs não captura alterações em OS antigas. O incremental paginado continua bloqueado até corrigir/validar a paginação.

O checkpoint temporal só é estabelecido ao terminar uma execução sem limite de teste de um intervalo iniciado em ID 1. Usa o horário **do início original da varredura**, incluindo retomadas, para não avançar até o término e perder alterações ocorridas durante a carga. A varredura não fornece snapshot transacional da API; reconciliação futura ainda é necessária.

Consultar progresso no SQL Editor do Supabase:

```sql
SELECT company_id, from_id, to_id, last_id, status, updated_at
FROM public.integracao_m8_id_scan
ORDER BY company_id;
```

A execução iniciada neste workspace usa `node dist/scripts/syncIds.js --from-id=1 --to-id=14681` em processo independente, com log em `.m8/id-scan.log` e PID em `.m8/id-scan.pid`. Arquivos `.m8/` são ignorados pelo Git. O processo depende deste ambiente continuar ativo; uma parada do workspace exige reexecutar o comando de retomada. Não foi configurado agendamento.

A migration `004_m8_approval_mixed.sql` corrige `status_aprovacao` para texto: a amostragem ampliada mostrou que o campo pode vir como código numérico ou rótulo em string. O mapeamento aceita ambos e o payload conserva o tipo original, sem inventar uma legenda de enum.

## Descoberta de IDs por listagem resumida

Com autorização do usuário, foi consultado o endpoint documentado `GET /v1/assistenciatecnica/ordemservico?Page=0&PageSize=0`. Ele retorna os campos principais da OS, sem produtos, serviços e demais coleções filhas. O contrato foi conferido no OpenAPI público da M8 (`/swagger/v1/swagger.json`). Essa autorização é específica para a listagem resumida; `ordemservicocompleta` continua sendo consultada por ID.

```bash
npm run m8:inventory
```

O comando consulta as três empresas e informa quantidade de IDs distintos, maior ID, repetições e contagens por status. Não grava clientes/payloads nos logs nem escreve dados no banco. O módulo `src/m8/inventory.ts` devolve somente ID, status e número de ocorrências. Repetições de ID na mesma empresa são eliminadas explicitamente; status contraditórios resultam em `null`, exigindo consulta de detalhe, sem escolher `Processado` por suposição.

Na consulta real de 2026-09-11 foram encontrados **12.650 IDs distintos**, maior ID **14691**, sem IDs compartilhados entre empresas. Ver contagens e tempos em `docs/validacao-m8.md`. O resultado é a lista visível ao usuário autenticado na API, ainda sujeito à reconciliação com o ERP.

Essa listagem permite substituir a sondagem de números por uma fila de IDs realmente existentes. Regra para a próxima rotina automática: comparar o inventário com o banco; buscar detalhes de IDs ausentes e OS cuja última versão completa persistida ainda não seja `Processado`; ao receber a versão final, gravar OS+filhos em transação antes de retirá-la da revisão frequente. Uma OS nova já processada também precisa de importação completa. As OS canceladas continuam revisáveis, pois somente `Processado` foi confirmado como imutável pelo usuário.

O comando de inventário já está disponível; a fila automática e seu agendamento ainda não foram implementados. A varredura por faixa iniciada anteriormente mantém o limite 14681 até a substituição controlada por esse fluxo. Novos IDs acima desse limite não devem ser considerados cobertos por aquela carga.
