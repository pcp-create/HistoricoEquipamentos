# Base provisória de preventivas — M8 e Iliot

Esta rotina é uma pesquisa auditável. Não altera equipamentos, horímetros nem planos existentes. Os dados privados ficam em `.m8/preventive-research/`, ignorados pelo Git. A base local SQLite e os arquivos JSON/CSV devem ficar restritos à equipe autorizada.

## Fontes e vínculo

- M8: todos os equipamentos presentes; OS das empresas 1, 2 e 27404; campo instalado e vínculos validados de `m8_equipment_linked` (incluem observações tratadas pelo integrador).
- Iliot machines: `https://equipamentos-4ejo.onrender.com/machines`. Relaciona `id` Iliot com `m8_external_id` M8. Nenhuma associação aproximada por nome é aplicada automaticamente. Vínculos ausentes/múltiplos são sinalizados.
- Iliot OS: `https://app.rjcompressores.com.br/api/v1/integration/service_orders.json?page=N`, com cabeçalho `iliot-company-token` fornecido no Power Query. Apesar do endpoint machines não pedir autenticação, a consulta de OS fornecida utiliza token.

## Execução

A exportação M8 usa a configuração de banco da aplicação web e conexão somente leitura:

```bash
cd web
npm run preventives:export
cd ..
```

Colete a base Iliot, informando o caminho do arquivo privado Power Query (fora do Git) ou a variável de ambiente `ILIOT_COMPANY_TOKEN`:

```bash
python3 scripts/preventive_research.py collect --token-file /caminho/privado/consulta-iliot.txt
python3 scripts/preventive_research.py build
```

O coletor exige Python 3 e usa somente biblioteca padrão. Pode rodar em outra máquina autorizada e o diretório coletado ser trazido ao ambiente da pesquisa. A conexão HTTPS verifica certificados. Não há envio de dados ao Iliot, somente GET. Uma falha preserva páginas e checkpoint; executar novamente retoma a página pendente. A coleta termina somente quando chega uma página vazia. Páginas repetidas e erros de formato interrompem a execução. Para nova fotografia completa, use um novo `--directory` e exporte o M8 para ele via `PREVENTIVE_RESEARCH_DIR` (na exportação o caminho é relativo a web).

## Saídas

- `research.sqlite`: equipamentos, OS M8 brutas, OS Iliot brutas, máquinas Iliot, evidências de manutenção e candidatos a leitura. Tabelas com `equipment_id` e `payload` JSON para consulta sem perder os campos originais.
- `equipment-summary.csv`: equipamento, intervalo, última data candidata, empresa, OS e quantidade de pendências. Contém inclusive os equipamentos sem histórico identificado.
- `equipment-report.json`: intervalos agrupados, última evidência elegível, vínculo Iliot e sugestão de leitura.
- `checklist-inventory.json`: inventário de grupos, nomes e prefixos numéricos para ajustar o mapeamento à API real.
- `summary.json`: cobertura e indicador de conclusão da coleta Iliot.

## Regras e limites

- Extrai 2.000/2000, 4.000/4000 etc. após manutenção, preventiva ou revisão. Não confunde horímetro com intervalo.
- Tipos como “PREVENTIVA A 2000 / 4000 HORAS” são alternativas. Uma observação inequívoca pode indicar qual se aplica; sem isso ambos permanecem candidatos para conferência.
- Menções próximas de orçamento, próxima manutenção, programação, negação ou pendência ficam em revisão. Análise textual é heurística: evidência elegível não equivale a confirmação técnica de execução.
- Última evidência elegível exige OS Processado, sincronização finalizada e não pendente, exatamente um equipamento vinculado e data não futura. OS de outras situações são preservadas como evidência pendente.
- Data candidata usa entrega, emissão ou abertura, nesta ordem, registrando o campo escolhido. Esses campos não comprovam a data real de execução. Conferir antes de preencher a última intervenção.
- Leituras de checklist mantêm item, campo e rótulo. O extrator inicial reconhece horímetro/horas totais/funcionamento, mas não considera horas de carga, parcial, intervalo ou campo hours de manutenção como total.
- Enquanto o payload real das OS estiver inacessível, candidatos de checklist permanecem em revisão, sem atribuir data planejada/atualização como data da leitura. Cadastro machines também não comprova que working_time é uma leitura real; sensores virtuais nunca são promovidos automaticamente a leituras reais.
- Estimativa usa duas datas reais distintas, rejeita conflitos, valores decrescentes e taxas acima de 24 h/dia. A taxa é horas por dia corrido. Jornada diária e dias trabalhados/ano não são identificáveis separadamente: 365 é apenas uma base equivalente, nunca rotina confirmada. Equipamentos de locação exigem considerar períodos parados antes de aplicar essa taxa no cálculo operacional existente.
- Esta fase não escreve nas tabelas de planos/settings nem preenche o módulo automaticamente. O próximo passo, após a coleta Iliot e validação de datas/campos, é disponibilizar sugestões revisáveis por equipamento.

## Cobertura inicial — 21/09/2026

2.382 equipamentos M8; 12.733 OS M8; 2.801 máquinas na base paralela; 2.352 equipamentos M8 possuem vínculo Iliot, sem duplicidade nesse recorte. 30 equipamentos M8 não têm correspondência nessa base.

O endpoint de OS Iliot respondeu Cloudflare 1010 (HTTP 403), com uma resposta intermediária 429. Não há OS Iliot coletada e não é possível concluir o mapeamento real de checklists/horímetros até a liberação. As contagens atualizadas de manutenção ficam em summary.json.

## Verificação

```bash
python3 -m unittest discover -s scripts -p 'test_preventive_research.py'
```

## Conferência da planilha

O intervalo exportado é o valor literal mencionado em tipoAtendimentoNome ou observacao, não um intervalo homologado para aquele modelo. Valores como 36.000/38.000 não são convertidos para outro intervalo. O número da OS usa numero_sequencia e, quando ausente, id_m8. Linhas sem evidência elegível mostram a última menção com aviso explícito de revisão, OS e origem. maintenance-evidence.csv detalha todas as menções (incluindo as anteriores), com texto completo, campo, empresa e motivo de revisão. Datas são da OS, não datas de medição de horímetro.

## Importação dos planos validados

Após autorização do usuário, o script `web/scripts/import-preventive-research.mts` importa somente intervalos com última evidência elegível. Por padrão executa uma simulação; `--apply` grava em transação. Revalida vínculo, status, sincronização, data e texto da OS no banco atual. Preserva planos ativos ou arquivados do mesmo equipamento/intervalo. Registra lote, hash da pesquisa e evidência no histórico de eventos e em relatório privado local.

Não preenche `lastMeter`, intervalo em meses nem configurações de operação. O prazo por horas depende da etapa posterior de horímetros. OS em revisão não gera plano automaticamente.

```bash
cd web
node --env-file=.env.local --import tsx scripts/import-preventive-research.mts
node --env-file=.env.local --import tsx scripts/import-preventive-research.mts --apply
```

## Horímetros — data e status validados

O usuário autorizou todos os status e a data do checklist, interpretada como `service_orders.planned_date`, como referência. As leituras coletadas por SELECT na conexão somente leitura Iliot ficam em `.m8/iliot-readings/`. Itens/OS excluídos continuam fora; valores vazios, negativos, não numéricos ou datas futuras não são promovidos.

`scripts/prepare_iliot_readings.py` relaciona série completa do item + cliente, ou máquina da OS quando há somente um item de horímetro e a identificação não contradiz a série. Ambiguidades, conflitos na última data, reduções e taxas acima de 24 h/dia ficam no relatório de pendências. O maior horímetro não substitui a regra de data mais recente. Séries sem correspondência inequívoca não são vinculadas por aproximação.

`web/scripts/import-iliot-readings.mts` simula por padrão; `--apply` grava leitura real e data em `web_equipment_settings`, no banco do sistema, com transação, preservação dos dados anteriores e auditoria em `web_equipment_events`. Nunca escreve no Iliot. Não troca leitura existente de data igual/mais nova nem valor maior; não altera planos. Cada relatório de lote privado contém antes/depois e evidência.

A média entre duas leituras é somente horas por dia corrido, registrada nas observações. Jornada e dias/ano permanecem intactos. Horímetro da última intervenção de cada plano não é inferido a partir da leitura atual: exige medição correspondente à intervenção.

## Operação preenchida por autorização do usuário

Em 21/09/2026, usuário autorizou estimar operação e usar 24 h/dia + 365 dias/ano quando faltarem dados. `web/scripts/import-operating-estimates.mts` aplica essa etapa separadamente, em transação e com auditoria. Usa média positiva válida de horas por dia corrido + 365 dias/ano como base equivalente, apenas quando corresponde à última leitura importada e não há rotina preenchida. Preserva campos já definidos. Não usa média por dias corridos na frota de locação, para não descontar duas vezes a inatividade tratada pelas regras de locação. Ausência de diferença positiva não comprova jornada: recebe o padrão autorizado. Horímetros e planos não são alterados.

Lote 5a99cdcd-3e5a-412e-ba44-5766595db30a: 2.383 equipamentos presentes, 133 médias estimadas e 2.250 padrões autorizados. Valores e origens estão nas observações e em eventos de auditoria. Horímetro da última intervenção continua dependendo de evidência própria daquela manutenção.

## Revisão posterior de divergências autorizada

Por autorização do usuário, reduções e taxas superiores a 24 h/dia não impedem mais registrar a leitura mais recente com vínculo inequívoco. Cada caso recebe aviso com leitura anterior e atual; a média desse par não é aplicada à rotina operacional. Não são importados conflitos de valores na mesma data, vínculos ambíguos, campos inválidos nem datas futuras. Relatório privado: .m8/iliot-readings/leituras-para-revisao.csv.

### Complementação dos planos — 21/09/2026

Autorizado o cadastro dos planos faltantes, sem publicação no GitHub. A conferência usou o catálogo atual (2.383 equipamentos) e as menções de intervalos nas observações e no tipo de atendimento das OS M8. Intervalos alternativos como `2000 / 4000 HORAS` geram planos separados, com a ambiguidade e a OS de origem registradas nas observações. Uma menção em OS pendente permite cadastrar o plano, mas não comprova execução: última data, OS da intervenção e horímetro da intervenção permanecem vazios nesses casos.

Resultado confirmado no banco: **992 planos novos em 445 equipamentos**, preservando os **422 planos existentes**. Lote `191700f6-c4c5-46c9-aa7c-366aa8ad307d`. O equipamento M8 22445, série BQR141801, recebeu os planos de 2.000 e 4.000 horas com referência à OS 14682. Não foram alteradas suas leituras nem a rotina operacional.

Dezessete candidatos não passaram na revalidação do vínculo com a OS no banco e não foram gravados. Os detalhes estão no relatório privado `.m8/preventive-research/missing-plans-191700f6-c4c5-46c9-aa7c-366aa8ad307d.json`. Os eventos de criação guardam lote, plano e evidência de origem. O importador `web/scripts/import-missing-preventive-plans.mts` oferece simulação por padrão e grava somente com `--apply`, preservando planos existentes do mesmo equipamento/intervalo, inclusive arquivados.

Corrigido também o reconhecimento da unidade: `HORARIO` não pode ser interpretado como `HORA`, evitando extrair o ano de uma data como intervalo. Seis testes Python passaram e a checagem TypeScript passou antes da gravação.

### Últimas intervenções — 21/09/2026

Revisados os 1.414 planos ativos após atualização do levantamento M8 (12.737 OS; 2.383 equipamentos). O novo preparo `scripts/prepare_last_interventions.py` também aceita observações que confirmam explicitamente execução (`REALIZADO MANUTENÇÃO…`), mesmo quando o texto próximo menciona o orçamento aprovado. Isso não aceita execução negada/futura, intervalos alternativos, OS pendente, coleta incompleta, vínculo ambíguo ou data futura. Seleciona a evidência mais recente por equipamento e intervalo.

O importador `web/scripts/import-last-interventions.mts` preenche somente intervenções vazias e revalida status, coleta, vínculo, texto e data no banco antes de gravar. Preserva os 422 registros já preenchidos. Grava data e OS da última intervenção, com origem nas observações e evento de auditoria; não infere o horímetro da intervenção usando uma leitura posterior. Simulação é o padrão; `--apply` aplica em transação. Relatórios privados `last-interventions-*.json` contêm antes/depois e pendências. Validação: nove testes Python e TypeScript sem erros.

Aplicação concluída: **203 intervenções em 121 equipamentos**, lote `b78fb851-b82e-4e49-9203-19b866b9eac7`. Restam 789 planos sem evidência inequívoca de execução; mantidos em branco. Nenhuma publicação no GitHub foi feita.

### Complementação de horímetros, meses e escalonamento — 21/09/2026

Aplicado lote `e020a434-9f8a-479b-8c89-5284ebd2baa5`, com **1.341 planos alterados em 603 equipamentos**, conferidos após commit. Preenchidos 1.173 intervalos em meses; atualizadas 705 datas/OS e 862 leituras de intervenção. Campos e intervenções recentes existentes são preservados. Prazos autorizados: 2.000 h → 6 meses; 4.000 h → 12; 8.000 h → 24; a partir de 20.000 h → 60. Demais intervalos sem regra explícita permanecem como estavam.

`prepare_plan_completion.py` cruza OS processadas e coletadas integralmente com equipamento único, referências de revisão, leituras Iliot ligadas ao relatório/OS e horímetros explícitos na observação M8. Não usa o horímetro atual estimado como leitura histórica. A revisão maior inclui os planos de menor intervalo, conforme regra autorizada. Serviços combinados do tipo 2.000/4.000, quando há confirmação de realização, abrangem os dois planos. Datas futuras, vínculos ambíguos e valores conflitantes de uma mesma leitura não são inferidos.

Exemplo: equipamento 23296, OS 14153, leitura 2.543 h em 31/07/2026: planos de 2.000/4.000 preenchidos com os mesmos dados da intervenção e meses 6/12. Relatórios privados: `plan-completion-<lote>.json` (antes/depois/evidência) e `planos-campos-pendentes.csv` (695 planos ainda com algum campo ausente, inclusive intervalos em meses não definidos).

No sistema, ao registrar manutenção em um plano, `cascadeIntervention` atualiza os planos menores na mesma transação, com versionamento e auditoria individual. Preserva intervenções mais recentes e não reduz horímetros. Planos apenas por meses e planos arquivados não entram nessa propagação. Sete testes de planejamento/persistência passaram, incluindo execução e auditoria da cascata. Código permanece local, sem publicação.
