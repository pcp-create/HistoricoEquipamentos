# Roteiro de validação real M8

Status em 2026-09-11: **conexão SSL, migrations e importação real de uma OS por empresa concluídas**. O certificado `prod-ca-2021.crt` foi configurado em `DATABASE_SSL_CA_FILE`, mantendo a verificação TLS habilitada. Credenciais continuam somente no `.env` privado. A carga histórica não foi executada; paginação segue inconsistente e a alternativa por ID depende de limite superior confiável.

## Evidências atuais

| Empresa | `m8:test` (autenticação + consulta + mapeamento) | Page=1/PageSize=10 | Page=1/PageSize=5 | Page=2/PageSize=5 |
| --- | --- | --- | --- | --- |
| 1 | Passou; HTTP 200 | 10 OS | 5 OS | 0 OS |
| 2 | Passou; HTTP 200 | 10 OS | 5 OS | 0 OS |
| 27404 | Passou; HTTP 200 | 10 OS | 5 OS | 0 OS |

Token em `data.token` confirmado. `npm run m8:test` terminou com código 0; `npm run m8:test:pagination` terminou com código 1, detectando a divergência acima. Os diagnósticos não imprimiram payloads, dados de clientes, senhas ou tokens.

Na empresa 1 também foram testados tamanhos 1 e 2, com o mesmo comportamento (Page=1 cheio, Page=2 vazio). Nomes de parâmetros em minúsculas `page`/`pageSize` não corrigiram o problema. O retorno contém apenas `data` e `errors`, sem metadados de total. O teste anterior de Page=0/PageSize=5 retornou HTTP 400 nas três empresas.

O usuário informou que usa **Page=0/PageSize=0** para obter a base completa. Essa modalidade não foi chamada pelo integrador e não demonstra que a paginação funcione. A evidência de 10 registros disponíveis contra zero na segunda página de tamanho 5 mostra que encerrar a carga nessa página perderia registros. `M8_PAGINATION_VALIDATED` permanece `false`.

Correção/alternativa necessária: confirmar com a M8 a implementação e os parâmetros da paginação, usando a reprodução acima. Se o endpoint só funcionar sem paginação, a alternativa a avaliar é dividir a consulta por períodos pequenos com limites de volume/tempo e validar os filtros/contagens antes de habilitar um modo distinto. Não substituir silenciosamente a estratégia por uma requisição da base inteira.

## Datas e tipos adequados após a amostra real

O usuário confirmou “fuso horário do Brasil”; a configuração explícita adotada é **horário de Brasília, `America/Sao_Paulo`**. Para estabelecimento que use outro fuso brasileiro, configurar `M8_TIME_ZONE`. Datas sem offset/Z da OS, produtos, serviços e equipamento agora são convertidas para UTC usando as regras IANA, incluindo horário de verão histórico. Offsets já informados são preservados. Horários locais ambíguos ou inexistentes em transições são recusados para revisão.

Quatro tipos foram adequados com a migration `002_m8_observed_types.sql`:

- `statusAprovacao` da OS: código numérico preservado em `bigint`.
- `tipoContrato` do produto: código numérico preservado em `bigint`.
- `faturado` do produto: valor numérico preservado em `numeric`, sem converter para booleano ou presumir que é quantidade.
- `aprovado` do produto: string preservada em `text`, sem interpretar como sim/não.

A semântica/legenda desses campos ainda depende da documentação M8; armazenar seus tipos originais não exige inventar essa interpretação. Outros valores/tipos e coleções ainda precisam de amostragem maior. O primeiro teste tinha falhado por falta de fuso e tipos provisórios; após essas mudanças, o teste básico passou nas três empresas. As migrations foram aplicadas posteriormente; ver atualização final abaixo.

Registrar para **cada empresa 1, 2 e 27404**: data, responsável, resultado de cada teste e diferenças de contrato. Não anexar tokens, senhas ou dados pessoais ao Git/issues/logs.

## 1. Autenticação e contrato

1. Configurar `.env` com credenciais reais, `M8_COMPANIES=1,2,27404` e a base HTTPS sem `/v1`.
2. Confirmar o JSON de retorno de `POST /v1/auth/token` em ambiente privado. O briefing só descreveu o request. Configurar `M8_TOKEN_PATH` com o caminho real, como `token` ou `data.token` **somente se confirmado**, sem alterar o endpoint. O integrador não tenta formatos alternativos silenciosamente.
3. Executar `npm run m8:test`. O comando autentica cada empresa e consulta Page=1/PageSize=1. Falhas indicam etapa/status sem corpo bruto. HTTP 401/403 na autenticação pede conferir credenciais, tenant, estabelecimento e permissão do usuário.
4. Comparar amostra privada com `src/m8/types.ts` e `src/database/schema.ts`: capitalização (inclusive siglas), tipos booleanos/numéricos, nulos, IDs e datas. Confirmar que filhos completos têm IDs estáveis no contexto da OS. Coleção não vazia sem ID é erro; não gerar ID por posição/hash sem acordo sobre identidade.
5. Verificar `empresaId` versus empresa de autenticação, e se a API entrega escopo exclusivo ou compartilhado. Não deduplicar empresas pelo mesmo ID. Ajustes exigem decisão explícita se houver espelhamento entre estabelecimentos.
6. A leitura de datas sem offset usa `M8_TIME_ZONE` (Brasília por padrão); essa conversão está testada. Os filtros são enviados como instantes UTC com Z: ainda verificar se o servidor respeita offsets e quais limites inclui. Não confundir a validação do payload com a do filtro.
7. Examinar `manutencao`: objeto preservado em tabela própria; propor colunas após amostra. Confirmar se `equipamentoProduto.id` identifica observação por OS ou equipamento global. O modelo atual preserva a origem por OS.

## 2. Paginação

1. Executar `npm run m8:test:pagination` em uma base com mais de cinco OS.
2. O comando compara Page=1/PageSize=10 com Page=1/PageSize=5 + Page=2/PageSize=5. Os conjuntos devem ser equivalentes sem duplicatas. Essa validação atualmente falha nas três empresas.
3. Se a comparação de conjuntos passar, somente nesse diagnóstico ele sonda Page=0/PageSize=5. Se for rejeitada por HTTP 400 ou equivaler à página 1, há evidência de início em 1. Se retornar conjunto diferente, para nesse ponto: investigar origem/semântica em vez de pular registros. Não usar PageSize=0.
4. Em um intervalo pequeno, conhecido e estável, comparar a contagem com o ERP. Observar última página parcial e a próxima vazia. Confirmar que `data.length < PageSize` significa término, e não limitação interna de tamanho. Inspecionar metadados reais se existirem; não assumir nomes de contadores.
5. Conferir estabilidade da ordenação e respostas quando OS são alteradas enquanto pagina. Sem cursor/snapshot garantido, programar reconciliação futura.
6. Bases pequenas tornam o teste inconclusivo; validar manualmente com evidência ou em uma base adequada. Não marcar como validado apenas porque uma consulta retornou 200.

## 3. Filtro de atualização e carga inicial

1. Selecionar uma janela pequena e comparar OS retornadas com registros conhecidos antes, dentro e depois do intervalo.
2. Verificar limites inclusivos/exclusivos, precisão de segundos/milissegundos e timezone. Os limites mensais sobrepostos precisam cobrir todas as datas.
3. Confirmar que OS antigas têm `dataAtualizacao` utilizável. A opção inicial padrão é atualização, pois permite a mesma semântica do incremental. Isso é **decisão provisória, não conclusão empírica**.
4. Se atualização não cobrir todo o histórico, usar `INITIAL_SYNC_DATE_FIELD=emissao` após comparar a contagem por emissão com ERP. Ajustar data inicial ao histórico existente.
5. Teste crítico em OS de homologação, por operador autorizado: consultar OS e registrar `dataAtualizacao`; alterar/adicionar produto; consultar novamente; verificar se a data da OS mudou **e** se filtro por atualização retorna a OS. Repetir para serviço, apontamento e equipamentoProduto. Não modificar registros de produção apenas para testar sem autorização própria.
6. Se filhos mudarem sem refletir nos filtros, incremental sozinho é insuficiente. Documentar a falha; reprocessar janelas usando `sync:reprocess`. Atenção: esse comando também usa **atualização da OS**; se o pai não é atualizado, janelas recentes podem não reencontrar OS antigas. Para reduzir esse risco de fato, reprocessar uma janela de atualização ampla que inclua essas OS (até histórico inteiro), ou acrescentar estratégia por emissão/ID/endpoint específico após validar a API. Reprocessamento de 7/90 dias não garante capturar filho alterado em OS antiga.

## 4. Persistência e exclusões

1. Configurar `DATABASE_URL` direta ou Session pooler, com TLS. Executar `npm run db:migrate`.
2. Executar `npm run sync:test -- --from=... --to=...`; conferir empresa, OS e filhos. É escrita real limitada a duas páginas por empresa, sem checkpoint.
3. Repetir a mesma carga: nenhuma duplicação. Comparar valores e quantidade; contador de atualizações pode crescer mesmo quando os dados são iguais.
4. Confirmar que `estaExcluido=true` é conservado e não aparece nas views operacionais.
5. Confirmar comportamento de filho que some da resposta: o integrador preserva o último estado. Se necessário, projetar reconciliação auditável em migration futura, sem apagar silenciosamente.
6. Verificar números/séries de equipamento na OS versus equipamentoProduto. Views atuais usam dados da OS para evitar multiplicação de materiais.
7. Após confirmar todos os itens, definir `M8_PAGINATION_VALIDATED=true`, retirar `SYNC_MAX_PAGES`, executar carga inicial e depois incremental.

## 5. Resiliência e operação

Os testes locais já simulam falha de página/filho, 401, retry e bloqueio concorrente. Em homologação, confirmar conexão TLS, liberação de advisory lock ao encerrar o processo e recuperação da execução interrompida. Conferir `integracao_m8_log` e checkpoint por empresa; falha de uma empresa não deve avançar seu marcador nem impedir tentativa nas seguintes.

A ausência de token/corpo nos logs é intencional. Se precisar investigar uma mensagem remota, inspecionar privadamente com as ferramentas da M8, sem copiá-la para logs compartilhados. Não registrar a carga como validada até reconciliar contagens com o ERP.

## Atualização — conexão PostgreSQL e consulta por ID

`DATABASE_URL` foi salva pelo usuário. A senha continha `#` em URI sem aspas, fazendo dotenv truncar o valor. O arquivo privado foi corrigido com percent-encoding da senha e aspas, sem mudar a senha. A conexão chega ao servidor, mas a validação TLS falha com `SELF_SIGNED_CERT_IN_CHAIN`, inclusive com CAs do sistema habilitadas. É necessário baixar o certificado CA pelo painel Supabase → Database → Settings → SSL Configuration e configurar `DATABASE_SSL_CA_FILE`. A validação TLS não foi desabilitada; nenhuma migration remota foi executada.

Teste somente de leitura do filtro `Id`, com Page=1/PageSize=2, nas três empresas:

- Um ID conhecido, obtido de consulta pequena de cada empresa, retornou exatamente a OS correspondente em todas elas.
- IDs 1 e 2 retornaram vazio nas empresas 1 e 27404; na empresa 2 retornaram uma OS cada, com ID correspondente.
- Nenhum retorno trouxe OS com ID diferente do solicitado.

O filtro por ID funcionou nessa amostra e há evidência de lacunas/escopos diferentes por empresa. Uma varredura precisa de limite superior confiável; ID ausente não encerra a carga. Ainda não foi executada varredura histórica nem importação no Supabase.

## Atualização final — certificado e importação controlada no Supabase

- Conexão PostgreSQL validada com o certificado CA fornecido e verificação de hostname/cadeia TLS mantida.
- Migrations `001_m8_history.sql` e `002_m8_observed_types.sql` aplicadas no Supabase com sucesso.
- Uma OS conhecida de cada empresa foi consultada pelo filtro `Id`, usando Page=1/PageSize=2 e exigindo retorno único com o ID solicitado.
- Cada OS foi gravada duas vezes: primeira execução inseriu 1 OS; a segunda inseriu 0 e atualizou 1. Nenhuma duplicação na amostra.
- Checkpoints de todas as empresas permaneceram inalterados. Logs de teste foram finalizados como `LIMITADO`.

| Empresa | OS | Produtos | Serviços | Equipamentos | Anexos |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 1 | 1 |
| 2 | 1 | 4 | 0 | 1 | 0 |
| 27404 | 1 | 1 | 0 | 0 | 0 |

Não havia apontamentos, respostas de checklist ou manutenção nessas amostras. As três views operacionais retornaram sete linhas cada. Esses resultados validam somente a amostra importada; não comprovam completude histórica, comportamento de coleções ausentes ou filtro por atualização de filhos.

Próxima etapa para varrer por ID: obter maior ID confiável por empresa (ou endpoint documentado que o informe), manter lacunas sem interromper a varredura e preparar retomada por ID. Nenhum intervalo histórico amplo foi consultado nesta execução.

## Atualização — limite global 14681 e varredura retomável

O usuário confirmou IDs globais não repetidos entre as empresas e maior ID atual **14681**. Foram implementados `npm run sync:ids` e a migration 003 para retomada persistida por empresa/intervalo. A migration foi aplicada no Supabase.

O primeiro lote controlado encontrou `statusAprovacao` em string nas OS 3/empresa 1 e 5/empresa 2, além dos números observados anteriormente. Essas OS tiveram gravação revertida e os cursores ficaram antes do ID com erro. A migration 004 passou o campo para texto; o mapper agora preserva tanto códigos numéricos quanto rótulos, mantendo tipo original no payload. A retomada real passou pelos IDs pendentes após essa correção.

TypeScript, lint, build e **25 testes locais** passaram, incluindo retomada após erro, lacunas e ausência de checkpoint em cargas limitadas. Depois do lote de validação, os cursores estavam em 12 (empresa 1), 14 (empresa 2) e 20 (empresa 27404). Foi iniciada uma execução sem limite de teste, em segundo plano, até ID 14681 nas três empresas. Esses números representam o início dessa execução, não o progresso atual; consultar `integracao_m8_id_scan` para obter o estado atualizado.

A carga não está declarada concluída. Erros preservam o ID pendente para diagnóstico e retomada. A execução depende de o workspace permanecer ativo; não há agendamento externo configurado.

## Atualização — listagem sem paginação, somente cabeçalhos

OpenAPI oficial consultado em `https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json`: `GET /v1/assistenciatecnica/ordemservico` é a listagem resumida, com parâmetros Page e PageSize e resposta `ATOrdemServicoListResponseDto`. O schema não inclui as coleções filhas. O usuário autorizou explicitamente testar `Page=0&PageSize=0` nessa listagem.

Resultados da chamada real (tempos aproximados incluem autenticação, leitura e tratamento):

| Empresa | Linhas recebidas | IDs distintos | Repetições | Maior ID | Tempo | JSON aproximado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 12586 | 9737 | 2849 | 14691 | 17,7 s | 24,40 MiB |
| 2 | 2789 | 2313 | 476 | 14609 | 4,7 s | 5,37 MiB |
| 27404 | 738 | 600 | 138 | 14684 | 2,0 s | 1,42 MiB |

Total: **12.650 IDs distintos**. Nenhuma coleção filha presente e nenhum ID compartilhado entre empresas. As repetições internas não apresentaram divergência de status nessa amostra; a causa das repetições no endpoint ainda não foi determinada. O primeiro parser de OS completas recusou repetições; foi criado um parser específico de inventário que deduplica explicitamente, mantendo o contador de ocorrências e marcando status conflitantes como desconhecidos.

Contagens sobre IDs distintos:

| Empresa | Pendente | Processado | Cancelado |
| --- | --- | --- | --- |
| 1 | 360 | 8043 | 1334 |
| 2 | 10 | 1875 | 428 |
| 27404 | 60 | 431 | 109 |

São 10.349 processadas e 2.301 não processadas (430 pendentes e 1.871 canceladas). Segundo o usuário, após `Processado` não há mais alterações na OS. Isso permite reduzir a revisão recorrente depois de obter e persistir o detalhe final completo. O status do inventário sozinho nunca deve fazer pular uma OS ainda ausente no banco ou a gravação da transição final.

O snapshot privado `.m8/os-inventory.json` contém somente IDs/status e métricas, sem dados de clientes; está ignorado pelo Git. O comando reproduzível `npm run m8:inventory` consulta e apresenta métricas sem salvar o payload completo. Não foi implementado agendamento nem alterada automaticamente a varredura por faixa em andamento. O maior ID 14691 já supera o limite original 14681, demonstrando a necessidade de novos inventários para descobrir OS criadas durante a carga.

## Validação dos endpoints separados de produtos e serviços

Conferidos no OpenAPI público da M8 após indicação da documentação `/docs/index.html` pelo usuário:

- `GET /v1/assistenciatecnica/ordemservico/{ordemServicoId}/produto`: parâmetros Page, PageSize, Id, Nome e EstaExcluido.
- `GET /v1/assistenciatecnica/ordemservico/{ordemServicoId}/servico`: parâmetros Page e PageSize.

São endpoints por OS, não uma listagem global de todos os produtos/serviços. Teste somente de leitura com uma OS de cada empresa e Page=1/PageSize=100:

| Empresa | Produtos separados / completa | Serviços separados / completa |
| --- | --- | --- |
| 1 | 2 / 2 | 1 / 1 |
| 2 | 4 / 4 | 0 / 0 |
| 27404 | 1 / 1 | 0 / 0 |

IDs e quantidades de registros coincidiram em todas as coleções da amostra; sem errors na resposta. Não foi validada paginação de coleções com mais de 100 itens, nem o comportamento padrão de EstaExcluido (omitido neste teste). Para preservar auditoria, validar produtos excluídos antes de substituir a coleta atual. Nenhuma gravação foi feita por esses testes e o worker existente não foi substituído.

A estratégia de cabeçalhos globais + filhos por OS é suportada pelos endpoints. A implementação futura deverá manter pendência por coleção e só marcar a sincronização final de uma OS processada depois de confirmar/persistir todas as coleções requeridas. Os endpoints separados de equipamento/manutenção retornam listas segundo OpenAPI; não presumir que sejam intercambiáveis com os objetos singulares do endpoint completa sem validar essa diferença.

## Atualização — implementação do ciclo de cabeçalhos e coleções

Aprovada pelo usuário a substituição da varredura por lista completa de cabeçalhos + endpoints separados. Todos os endpoints de filhos foram testados com Page=0/PageSize=0 no contexto de uma OS de cada empresa. GET `checklistpergunta` é o endpoint documentado de leitura que contém nota/observação; `checklistresposta` é somente POST.

Na empresa 2, OS 1, `/produto` sem filtro retornou dois itens; com `EstaExcluido=false` retornou dois ativos e com `EstaExcluido=true` mais dois excluídos, com flags correspondentes. O novo fluxo consulta explicitamente os dois grupos, sem apagar histórico.

A inspeção completa dos cabeçalhos mostrou que as repetições de ID variam somente em **documentoFiscalId**. A migration 005 preserva todos os documentos em `m8_os_documentos_fiscais`, sem escolher um ID arbitrário. O cabeçalho singular fica nulo quando houver vários documentos. Duplicações com outros campos divergentes são recusadas.

A migration 005 também cria `integracao_m8_os_sync` (fila/estado por OS) e `m8_os_manutencoes` (coleção relacional, preservando a tabela singular legada). Horímetros passam a texto, como na documentação real. Foi aplicada no Supabase com sucesso.

Resultado do teste real `npm run sync:cycle -- --max-orders=2`:

| Empresa | Cabeçalhos únicos persistidos | OS com todas as coleções concluídas | Pendentes após o lote | Erros |
| --- | --- | --- | --- | --- |
| 1 | 9737 | 2 | 9735 | 0 |
| 2 | 2313 | 2 | 2311 | 0 |
| 27404 | 600 | 2 | 598 | 0 |

As seis OS do lote estavam Processado antes/depois das chamadas e receberam `finalized=true` apenas na transação que gravou todas as coleções. Não houve avanço do checkpoint temporal legado. O fluxo novo usa estado por OS, reenfileira não processadas em cada inventário, preserva pendências após erros e exige nova coleta se a OS muda durante a consulta dos filhos.

Testes locais cobrem consolidação de documentos, rollback de filhos, retomada de falha, transição para Processado durante a coleta, revisão de OS abertas, múltiplos equipamentos/manutenções e limite de tamanho de resposta HTTP. Não foi configurado agendamento externo; consultar `docs/operacao-servidor.md`.

### Ativação do novo worker

Após os testes, a varredura legada foi marcada como PAUSADO sem apagar seu último ID. Foi iniciado `node dist/scripts/syncCycle.js --resume` em segundo plano para drenar a fila real. O log está em `.m8/collection-cycle.log` e o PID em `.m8/collection-cycle.pid`. As primeiras OS adicionais das três empresas foram persistidas sem erro; uma OS não processada foi atualizada sem receber finalização, conforme a regra. Não há agendamento automático instalado; o workspace precisa permanecer ativo para essa execução.

Verificações finais: TypeScript, lint e build passaram; **34 testes locais passaram**. Para o progresso atualizado, executar `npm run sync:status`. Contagens do lote controlado acima são uma fotografia anterior à continuação do worker, não o progresso atual.
