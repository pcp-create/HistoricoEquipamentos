# Programação de OSs

O módulo fica em Assistência Técnica → Programação de OSs (`/programacao`). No detalhe da OS no histórico, **Programar OS** inclui a ordem uma única vez e abre uma operação em branco. A identidade da ordem inclui empresa e identificador M8.

## Calendário e operações

O calendário Padrão usa Brasília (UTC−03): segunda a quinta, 07:30–12:00 e 13:00–18:00; sexta, 07:30–12:00. O fim calculado pula intervalos e fins de semana e fica armazenado sem ocupar uma coluna na tabela. Exceções por período podem definir feriados (dias não úteis) ou horários especiais, substituindo a jornada semanal naquelas datas. Períodos sobrepostos são rejeitados. A tela oferece visão mensal, seleção de dias da semana, cópia de calendário e gravação explícita após a edição.

Data e horário separados permitem os estados Pendente → Em planejamento (data) → Programado (data e hora). A estrutura reserva `sent_at` e Aguardando Execução para a futura entrega ao dispositivo; esta versão não envia mensagens ou OSs aos técnicos.

Apontamento, início de execução ou ação no checklist inicia Em Execução. Finalização parcial mantém execução; completa muda para Aguardando Revisão. Administradores revisam e concluem. Operações concluídas são imutáveis, inclusive por proteção no banco.

Apoio não aceita o responsável nem pessoas duplicadas. Horas totais = duração × número de pessoas. Alterações salvam em segundo plano, com atualização visual imediata, controle de versão e reversão em caso de erro. Ações geram eventos e notas nas tarefas abertas vinculadas à OS.

## Produtos, serviços e custos

Produtos e serviços vêm da OS, sem divisão por operação. Quantidades retirada/utilizada começam nulas; zero é um valor informado. Administrador ou equipe vinculada pode preencher quantidades.

Custo/hora é informado no cadastro do funcionário. Mão de obra interna prevista usa duração de cada operação Interno × custo/hora de cada participante, agrupável por operação ou função. Ausência de custo é indicada, sem presumir zero.

Produtos usam custo médio disponível e preço da OS, respeitando compatibilidade de unidade. Serviços permitem custo manual ou aproveitamento explícito da mão de obra do cálculo de lucro existente, distribuído proporcionalmente à receita dos serviços. Esses custos não devem ser somados novamente à mão de obra interna quando representam o mesmo trabalho.

## Configurações e implantação

Administradores configuram tipos de serviço, checklists e calendários. Definições utilizadas não podem ser removidas. Mudanças de calendário recalculam operações ainda em planejamento. Entrada automática permite configurar regras de inclusão; nenhuma regra é ativada implicitamente.

Migração: `web/sql/028_service_scheduling.sql`. Testes: `service-scheduling.test.ts`, `service-scheduling.spec.ts`, `employees.test.ts`. O teste de interface utiliza dados simulados e não cria ordens reais nem dispara alertas.

## Entrada automática

Configuração `automaticEntry` em `web_service_schedule_settings.document` (migrações 032 a 034). Administradores escolhem Tipo, Situação, Tipo de atendimento e Status do lançamento; valores da seleção são os nomes distintos atualmente importados das OSs. Comparações: igual/diferente; valores ausentes nunca satisfazem uma condição.

Cada regra combina condições na ordem exibida (parênteses visíveis), com E/OU. As regras completas são alternativas: qualquer regra verdadeira inclui a OS. A prévia simula correspondências na base atual, sem incluir esses registros.

As regras são avaliadas apenas no INSERT de novas OSs importadas. Salvar ou alterar regras não inclui OSs antigas nem altera programações existentes. Atualizações posteriores das OSs não disparam a entrada automática. Inclusão idempotente cria uma operação pendente. Não envia alertas, não modifica operações existentes e não reativa programações removidas. Desativar impede novas inclusões, preservando o histórico. Nenhuma regra é ativada pela migração.

## Checklists por etapas

Migração 035 cria o armazenamento privado de fotos e adiciona, sem sobrescrever um modelo existente, o **CCP — Corretiva Compressor Parafuso**, baseado no PDF OS-2689 anexado. Seis etapas: Medições, Inspeções, Materiais, Relatório técnico, Fotos e Aceitação do serviço. Respostas, fotos e assinaturas do exemplo não são copiadas. Assinaturas podem ser desenhadas com dedo ou mouse e salvas como imagens no campo Assinatura.

Configuração permite criar/copiar modelos, prefixo, etapas ordenadas, grupos, campos ordenados e obrigatoriedade. Tipos: OK/NOK/NA, texto curto/longo, número, seleção, data, hora, foto e horímetro. As alterações são salvas explicitamente. A primeira liberação copia o modelo para a operação, preservando seu conteúdo contra alterações posteriores. Uma operação com checklist iniciado não permite substituí-lo.

Em **Operações → Acompanhar**, o administrador libera as etapas. A equipe atribuída pode salvar rascunhos e devolver etapas; campos obrigatórios são validados na devolução. O administrador pode reabrir uma etapa para correção. A conclusão completa exige todas as etapas devolvidas. Operações em revisão/concluídas bloqueiam edição. Disponibilização ocorre no sistema autenticado; notificações e entrega ao aplicativo/dispositivo externo ainda não são integradas.

O campo horímetro exige um equipamento vinculado à OS e data de leitura. Quando há um único vínculo, ele é pré-selecionado; havendo múltiplos, o técnico escolhe. Salvar a leitura mantém o rascunho na operação. Somente a ação administrativa Revisado atualiza `web_equipment_settings`, registra `web_equipment_events` e atualiza/cria a preventiva vinculada ao Identificador M8, tudo na mesma transação. Leituras incompatíveis, datas futuras, equipamentos sem vínculo e leitura abaixo de uma intervenção são rejeitados; leituras e intervenções posteriores já registradas são preservadas. Demais configurações do equipamento são preservadas.

Fotos JPEG/PNG/WebP de até 3 MB são normalizadas para JPEG (até 2000px), armazenadas com vínculo à operação/etapa/campo e acessíveis somente a administradores/equipe atribuída. Limite por campo configurável de 1 a 30 fotos (padrão 12 em campos Foto); remoção da resposta não apaga a evidência histórica armazenada. Versão otimista da operação protege concorrência nas respostas. Testes cobrem modelo CCP, validações, acesso, anexos, horímetro, preservação dos rascunhos de outras etapas e layout móvel.


### Hierarquia, complementos e exportação

A migração 036 converte subtítulos legados em grupos persistidos: Etapa → Grupo → Campos. IDs de campos e versões iniciadas nas operações permanecem intactos. O editor permite criar, ordenar e remover grupos, mover campos entre grupos e configurar Obrigatório, Fotos (máximo), Comentário, Relatório e Observação interna.

`report=false` exclui o campo inteiro (valor, comentário e fotos) do PDF. Modelos legados sem a propriedade conservam inclusão. Observações internas ficam nas respostas, mas nunca entram no modelo do relatório ou no PDF. Exportação em `/api/service-scheduling/checklist-pdf` usa a versão iniciada do checklist, respostas salvas, imagens e assinaturas, respeitando acesso de administrador/equipe atribuída. Etapas ainda não devolvidas são identificadas como rascunhos.

Comentários e observações são armazenados por campo em `stage.details`, separados da resposta principal. Limites de fotos, campos habilitados e propriedade dos anexos são verificados no servidor. A seleção de arquivos aceita várias fotos simultaneamente. Assinaturas são desenhadas em canvas, confirmadas e armazenadas como imagem; não constituem assinatura criptográfica.

Textos longos, comentários e observações oferecem ditado `pt-BR` via SpeechRecognition/WebKitSpeechRecognition, iniciado somente ao clicar no microfone. O navegador gerencia a permissão e o serviço de voz. Navegadores sem suporte mantêm a digitação; erros e permissão negada são informados. O técnico revisa e salva o texto transcrito. Testes de interface simulam a API de voz; disponibilidade real depende do navegador/dispositivo.

### Estrutura CCP conforme o relatório original

Campos podem pertencer diretamente à etapa (`direct: true`, sem cabeçalho de grupo) ou a grupos nomeados. Inspeções tem sete indicadores com comentários associados; Materiais e Fotos também não recebem grupo artificial “Geral”. Medições, Diagnóstico e Aceitação mantêm os subtítulos do documento. O botão “Adicionar campo à etapa” permite essa estrutura nos novos modelos.

Após as migrações SQL, execute `node --env-file=.env --import tsx scripts/migrate-ccp-structure.mts` a partir da raiz. A atualização é idempotente, limitada ao CCP original, preserva nomes personalizados e não altera snapshots ou respostas das operações. O modelo embarcado para “Usar modelo CCP” já contém a estrutura corrigida.

### Lista de checklists e identificação M8
A aba abre com os modelos cadastrados; o botão Editar abre cada modelo. Prefixo, Nome e Identificador M8 (tipo_atendimento_nome) são configuráveis. O identificador é preservado na cópia do checklist iniciada pela operação.

Na lista, “Preventivas por tipo de atendimento” permite configurar intervalo em horas e/ou meses, único por atendimento. Na revisão, o sistema usa a data da leitura e o horímetro informado para atualizar a preventiva ativa com esse identificador. Se não existe, cria com os intervalos configurados; planos existentes mantêm seus intervalos e materiais. No gerenciamento do equipamento, o plano pode ser associado ao Identificador M8. Tipos sem intervalo e sem plano associado atualizam apenas o horímetro, sem inventar ciclos para atendimentos corretivos. Associações duplicadas impedem a revisão até sua correção. A revisão registra `reviewApplied` e não reaplica a mesma intervenção; relatórios anteriores não retrocedem leituras/manutenções mais recentes. A sincronização de tarefas é solicitada após a revisão.
