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

### Operações sem equipamento específico

Na seleção de equipamento da operação, escolha **Sem equipamento específico**
para atividades gerais. O sistema salva `equipmentUnassigned: true` no documento
da operação e mantém `equipmentId` vazio, sem atribuir automaticamente a máquina
da OS no envio ao técnico. A opção também pode ser usada em listas de tarefas.
**Usar equipamento da OS** mantém o comportamento anterior de herança. Selecionar
uma máquina volta a vincular a operação normalmente. Os bloqueios após envio
ou registro de leitura continuam valendo.

Calendário, portal técnico e relatório identificam a operação como sem equipamento
específico, sem herdar oficina, série ou modelo da máquina da OS. Caso o checklist
inclua uma leitura de horímetro, o técnico precisa escolher expressamente uma
máquina vinculada à OS para essa leitura. Não há migração SQL para esta opção.


## Responsáveis por Status Fluxo e atribuição de tratativas

Em **Cadastros → Status Fluxo**, a coluna **Responsável Status Fluxo** define a área (Comercial, Planejamento, Almoxarifado, Compras, Faturamento ou Outro). As atribuições anteriores são preservadas inicialmente; atualizar os nomes dos status pelo M8 não sobrescreve as áreas locais.

Em **Programação de OSs → Configurações → Atribuição de tratativas**, selecione o usuário ativo de cada área. Sem usuário definido, não há encaminhamento automático. As alterações de configuração valem para os próximos encaminhamentos.

Após uma mudança de Status Fluxo, a tarefa existente de cada operação revisada é atribuída ao usuário da área configurada, mantendo o número e o histórico. A mesma regra é aplicada ao concluir a revisão quando o fluxo já está definido. A repetição de uma atualização não duplica tarefas nem registros de encaminhamento. Operações ainda em execução ou aguardando revisão e usuários inativos não são encaminhados por essa regra.

A regra é executada no banco também para atualizações recebidas do integrador. A área é usada nos filtros da programação e nos relatórios comerciais/projeção. Não altera o processamento fiscal da OS no ERP.

Instalação: executar `web/scripts/setup-flow-responsibilities.mts`, que aplica `web/sql/101_flow_responsibilities.sql`. A migração é repetível e não substitui escolhas já salvas.


## Quantidades informativas dos produtos

Na aba Produtos, as quantidades Retirada, Devolvida e Utilizada são apenas para consulta. A utilização é calculada como retirada bruta menos devolvida, com três casas de precisão. Os registros dos portais técnico e de almoxarifado são conciliados sem somar duas vezes a mesma retirada/devolução; considera-se o maior total registrado entre as duas fontes, conforme a regra de saldo do almoxarifado. Cada item é identificado por empresa, OS de origem e ID, inclusive nas OSs vinculadas. O campo antigo de utilização manual não define esse cálculo.

### Sequência das ações de revisão

O rodapé compacto mantém “Salvar ajustes”, “Concluir revisão” e “Devolver relatório ao técnico” na mesma linha quando há largura disponível, com quebra somente em telas menores. Os avisos e a declaração ficam em uma linha discreta abaixo das ações. Alterações no relatório ou fotos em envio bloqueiam a conclusão até o salvamento confirmado; uma falha ao salvar mantém o rascunho e o bloqueio. Sem alterações pendentes, o relatório já está salvo e pode ser concluído. O botão Concluir revisão representa a concordância com o relatório, as peças e os apontamentos, com essa declaração visível ao lado da ação, sem checkbox adicional. Pendências de alertas e solicitações de apontamentos continuam impedindo a conclusão. A devolução ao técnico permanece na mesma barra de ações.

### Anexo automático ao editar observações e Status Fluxo

A edição traz “Anexar relatório resumido automaticamente na OS” marcado por padrão a cada abertura. Ao salvar no ERP, o sistema salva o cabeçalho e envia o PDF resumido unificado das operações revisadas para os anexos da própria OS no M8. O destino é obtido no servidor pela programação, com conferência de acesso e revisão de todas as operações. O usuário pode desmarcar a opção para salvar somente as alterações.

O PDF não inclui linha do tempo, usa o nome padrão de exportação e é otimizado para o limite de 3 MB do ERP. A identidade do conteúdo impede repetir o mesmo relatório em novas tentativas, mesmo que os metadados internos do PDF mudem. Envios incertos permanecem bloqueados para conferência no ERP. Se o cabeçalho for salvo e um anexo falhar, a tela mostra o resultado parcial e permite reenviar apenas os anexos pendentes, preservando a alteração já confirmada. Nenhuma migration é necessária.

### Fotos na revisão do relatório

As fotos aparecem em cards e o card “+ Adicionar foto” fica depois da última imagem, mantendo as opções de câmera e galeria. O X no canto superior direito abre uma confirmação de remoção; cancelar preserva a foto e confirmar altera apenas o rascunho. É necessário salvar os ajustes para aplicar a remoção ao relatório. A mesma apresentação é usada nas fotos adicionais dos campos.

### Movimentações na aba Peças da revisão

A revisão da operação mostra Entregue (saída registrada pelo almoxarifado), Devolvido (devolução informada pelo técnico no app) e Recebido (entrada da devolução confirmada no almoxarifado). São totais da OS de origem de cada item, inclusive nas OSs vinculadas, independentes da retirada da operação atual. Os campos são somente informativos e mantêm visível a diferença entre devolução declarada e recebimento físico, sem somar os dois como movimentos distintos.


### Gestão de apontamentos pelo planejamento

Nas abas de apontamentos da programação da OS e da revisão da operação, o planejador pode incluir um apontamento manual selecionando a operação, a pessoa, os horários, as pausas e o motivo. O lançamento é salvo diretamente, inclusive após o envio do relatório, sem criar uma localização GPS fictícia.

Apontamentos finalizados com início e fim podem ser replicados para outras pessoas ativas na mesma operação, preservando horários e pausas. O sistema impede sobreposição de horários e cópias repetidas para a mesma pessoa. Lançamentos antigos sem início e fim precisam ser ajustados antes da replicação.

A exclusão de um apontamento finalizado exige confirmação e motivo. Remove suas horas e custos dos totais, preserva os dados originais na auditoria e mantém as cópias já atribuídas a outras pessoas. Apontamentos em andamento ou com solicitação de ajuste pendente não podem ser excluídos. Não há migração de banco para esta alteração.


### Destinatários, contatos e envio direto do relatório

O envio por e-mail carrega o e-mail já cadastrado no cliente do ERP e permite até 20 destinatários, separados por vírgula ou ponto e vírgula. Contatos cadastrados no portal ficam vinculados ao cliente (compartilhados entre suas OSs), com e-mail, nome, cargo e telefone; o cadastro no portal não altera o ERP.

O nome do PDF aparece antes do envio e pode ser editado. O padrão é `OS {número} - {cliente} {serviço abreviado} {modelo e série}.pdf`. O nome exibido é enviado ao servidor e usado no anexo real, inclusive no arquivo `.eml` baixado.

Além de criar rascunho, o usuário pode enviar diretamente pelo Gmail, após conferir a confirmação com destinatários e anexo. O remetente é a conta Google autenticada pelo usuário. Tokens permanecem no navegador e não são armazenados no portal. Antes do envio, o usuário escolhe as operações do PDF. As operações revisadas/concluídas com relatório vêm marcadas por padrão; operações pendentes ficam indisponíveis. O envio exige ao menos uma seleção e o servidor confere novamente se cada operação pertence à OS e está revisada. A mesma seleção é usada no envio direto, no rascunho e no download do e-mail. O nome padrão do anexo acompanha a seleção até ser editado manualmente.

Aplicar `web/sql/102_customer_contact_email.sql` antes de publicar a interface. A migração adiciona e-mail e cargo ao cadastro de contatos existente, preservando nomes e telefones.

Referência da integração: [Gmail API — envio de mensagens](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).


### Formatação da mensagem do e-mail

O campo Mensagem tem uma barra de formatação com fonte, tamanho, cor, negrito, itálico, sublinhado, tachado, alinhamento, listas, recuos de listas, citação, links, remoção de formatação e desfazer/refazer. Links abrem um diálogo para informar o texto e o endereço. Textos antigos sem formatação são carregados com escape de HTML. Padrões formatados são salvos como texto simples e HTML sanitizado, e carregados no editor com a formatação preservada.

O servidor remove tags, atributos e estilos não permitidos e limita os links a HTTP, HTTPS, mailto e tel. Mensagens formatadas são montadas com uma parte de texto simples e outra HTML dentro do mesmo e-mail, mantendo o PDF como anexo separado. Isso vale para o envio direto, o rascunho Gmail e o `.eml` baixado. O limite permanece em 10.000 caracteres de texto.

Referências técnicas: [Tiptap com Next.js](https://tiptap.dev/docs/editor/getting-started/install/nextjs), [sanitização de HTML](https://github.com/apostrophecms/sanitize-html).


### Seleção de destinatários em blocos

O campo Destinatários exibe os e-mails como blocos removíveis. Ponto e vírgula, vírgula e Enter confirmam o endereço; ao sair do campo, um endereço válido também é confirmado. Colar uma lista separada por vírgulas, ponto e vírgula ou quebras de linha adiciona seus endereços. Entradas inválidas permanecem visíveis para correção e bloqueiam o envio.

O botão `+` à direita abre uma lista pesquisável com os contatos do cliente e os endereços já selecionados. As caixas de seleção incluem ou removem destinatários, e o botão Adicionar contato ao cliente abre o cadastro dentro da própria lista. Ao salvar um contato, ele também entra na seleção. Remover um bloco afeta apenas o e-mail atual, preservando o cadastro do cliente.


### Equipamentos das operações selecionadas no texto do e-mail

`{equipamento}` lista uma linha por operação selecionada, na ordem das operações, no formato `· OP01 - Nome do equipamento`, incluindo série quando disponível. Se o equipamento for o mesmo em operações diferentes, cada operação mantém sua própria linha. `{equipamento_01}`, `{equipamento_02}` e seguintes permitem posicionar cada equipamento separadamente; posições sem equipamento ficam em branco. A numeração acompanha a seleção atual, sem reservar posições para operações não selecionadas. No assunto, a lista usa ponto e vírgula em vez de quebras de linha.

O texto padrão e o assunto são atualizados quando a seleção muda, enquanto não houver edições manuais. Edições na mensagem e sua formatação são preservadas; se os equipamentos mudarem depois disso, um aviso oferece reaplicar o texto padrão, deixando explícito que isso substitui as edições. Configurações antigas sem campos de equipamento recebem uma seção adicional com a lista de equipamentos no texto sugerido, sem alterar a configuração salva.


### Salvamento em segundo plano e envio pelo técnico

Ao trocar etapas/grupos do relatório ou sair da tela, o salvamento automático ocorre sem bloquear o preenchimento. As gravações são serializadas por operação. A confirmação de uma gravação anterior atualiza a base do rascunho sem substituir respostas mais recentes digitadas enquanto a requisição estava em andamento. O rascunho local continua disponível em caso de falha; o botão Salvar aparece somente enquanto há alterações pendentes.

O envio completo aguarda a gravação em andamento e valida as respostas atuais. O servidor encerra o apontamento de atividade do responsável, inclusive pausas e apontamentos vinculados iniciados em equipe, junto com o envio do relatório. Se houver erro de validação, toda a transação é desfeita e a atividade permanece aberta. Deslocamentos continuam exigindo odômetro final; apontamentos independentes de outros integrantes precisam ser encerrados por seus responsáveis.

Após enviar, abre a conferência de materiais: Não finaliza a operação e envia para revisão; Sim abre Peças e conclui a operação após salvar a conferência/devolução. O fluxo offline projeta o encerramento da atividade e preserva as ações na fila para sincronização. Não há migração de banco nesta alteração.


A seleção e o catálogo de endereços disponíveis no e-mail são independentes: os e-mails automáticos e os já utilizados neste preenchimento permanecem na lista do `+` ao serem desmarcados ou removidos pelo `x`. A desmarcação afeta somente os destinatários atuais. Os blocos selecionados e o campo de digitação compartilham uma única área com borda.


### Texto padrão formatado nas configurações

A configuração Texto padrão do e-mail usa a mesma barra do editor de mensagem. Ao salvar, o portal mantém o texto simples para compatibilidade e o HTML para preservar fonte, tamanho, cores, links e demais formatos. O HTML é sanitizado no servidor antes de entrar na configuração; não há migração de banco, pois os campos ficam no documento JSON existente.

Ao abrir o envio, o padrão formatado é aplicado automaticamente. Os campos dinâmicos são substituídos por texto escapado, preservando a formatação ao redor deles; a lista de equipamentos acompanha a seleção sem perder os estilos. Reaplicar o padrão também recupera a formatação salva.


### Sincronização do APK com pendências em falha

Uma falha permanente de envio fica preservada e deixa de ser reenviada automaticamente. A fila continua processando registros independentes; os dependentes de um registro ou foto com falha permanecem protegidos e são identificados na tela. Falhas temporárias de conexão continuam elegíveis para nova tentativa.

A presença de pendências deixa de congelar a programação inteira: a sincronização atualiza a lista de novas OSs e os detalhes das operações sem pendências, mantendo as projeções locais das operações que ainda aguardam confirmação. O botão Baixar programação também fica disponível com pendências. Uma edição capturada enquanto um download ocorre prevalece sobre a resposta antiga do servidor.

Na tela Sincronismo, Excluir pendência exige confirmação. A tela informa os registros dependentes e oferece excluí-los somente por escolha explícita. Se excluir apenas o primeiro, os dependentes ficam bloqueados para conferência. A exclusão afeta a fila local, preserva os dados já recebidos pelo servidor e guarda uma cópia local recuperável na exportação de pendências.

A lógica compartilhada é empacotada em `web/native/runtime.js` pelo build nativo. Publicar somente o site não atualiza o mecanismo dos APKs já instalados; a correção requer uma nova compilação/instalação do aplicativo. Não há migração de banco do servidor ou SQLite.


### Salvamento e recuperação no portal técnico — APK 2.2.15

Salvar fica sempre visível, vermelho com alterações pendentes e cinza quando salvo.
Enviar fica desabilitado enquanto houver campos obrigatórios incompletos ou alterações
pendentes de salvamento. O rascunho compatível do aparelho é recuperado automaticamente,
sem avisos ou botão de recuperação. A recuperação aplica os campos alterados localmente
e preserva atualizações do servidor nos demais campos.
