# Assistente RJ (DSU)

**DSU — Digital Support Unit · Assistente Digital de Suporte e Informação**.

Versão atual preparada para a instância **BotDemandas**, com menus numerados enviados por `sendText`. Listas e botões interativos foram substituídos por texto devido às falhas de entrega na instalação Evolution 2.3.7. Os fluxos atuais de avisos, alertas e conclusão continuam responsáveis pelos envios automáticos; o novo fluxo recebe mensagens e responde à conversa. Não altera agendamentos existentes.

## Conversa

- Número associado a exatamente um usuário ativo: menu Colaborador → Tarefas.
- Número externo, desativado ou ambíguo: menu Cliente, sem acesso a dados internos. Telefones brasileiros são normalizados com DDI e variação do nono dígito de celular.
- Criar tarefa: título → responsável → descrição → vencimento → tarefa restrita (sim/não) → alerta opcional com data/hora → confirmar/corrigir/cancelar.
- Menu numerado de responsáveis ativos com WhatsApp cadastrado (regra atual de atribuição), opção Para mim, pesquisa por nome e paginação. Máximo de dez opções por lista.
- Datas DD/MM/AAAA, hoje e amanhã, considerando Brasília. A data completa é confirmada antes de gravar.
- Minhas tarefas: tarefas abertas atribuídas ao remetente, ordenadas por vencimento e paginadas. A seleção mostra etapa, descrição inicial de tarefas manuais e link do sistema.
- Concluir: opção do menu ou comando `Concluir TAR-1521`. Exige confirmação; apenas tarefas manuais atribuídas ao remetente ou acessíveis por administrador. Tarefas de origem automática continuam sendo resolvidas na origem.
- Tarefas restritas: não revelam título, descrição, datas ou etapa para não administradores; mostram apenas código, responsável e status. Conclusão exige administrador.
- `Menu`, `Voltar`, `0` ou `Cancelar`: reinicia a conversa. Estado expira após 30 minutos de inatividade. IDs de botões antigos são rejeitados quando expirados. As respostas numéricas se referem sempre ao menu mais recente.
- Menu Cliente: atendimento técnico, orçamento e falar com a equipe. Nesta primeira versão, informa que o atendimento está em preparação, sem alegar abertura ou encaminhamento de solicitações.

## Implantação

1. Executar em `web`: `node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-dsu.mts`. Aplica `045_dsu_assistant.sql` usando o registro de migrações existente.
2. Publicar o código da aplicação. Configurar no servidor:
   - `DSU_AUTOMATION_TOKEN`: segredo exclusivo do fluxo, gerado e armazenado no gerenciador de segredos.
   - `DSU_WHATSAPP_INSTANCE=BotDemandas` (padrão do código).
3. Importar `automations/n8n/assistente-rj-dsu.json` no n8n.
4. No nó **Configuração**, manter `instance='BotDemandas'` e informar a mesma `evolutionUrl` dos fluxos de avisos. `systemUrl` já usa `https://rjcompressores.app`.
5. Configurar três credenciais:
   - **Receber mensagem**: Header Auth exclusivo para autenticar a Evolution. Configurar o mesmo header no webhook da Evolution. Sem essa autenticação, não ativar: o remetente é a identidade usada para operações de tarefas.
   - **Processar conversa**: Header Auth `Authorization: Bearer <DSU_AUTOMATION_TOKEN>`.
   - **Responder WhatsApp**: Header Auth `apikey` da Evolution, reutilizando a credencial existente.
6. Configurar `MESSAGES_UPSERT` para a URL de produção do webhook `/webhook/assistente-rj-dsu`, com `webhookByEvents=false`. Verificar o webhook atual antes de alterar: se já atende outro consumidor, encaminhar esse evento pelo roteador existente em vez de substituí-lo. O fluxo ignora mensagens próprias, grupos, broadcasts, eventos antigos e instâncias diferentes.
7. Testar com um colaborador autorizado: menu, lista de responsáveis, criação, tarefa no sistema, consulta e conclusão. Validar a renderização real dos menus na versão instalada da Evolution/WhatsApp. O workflow fica inativo no arquivo até configurar credenciais e encaminhamento.

Referência dos payloads interativos: [DTO oficial da Evolution API](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/dto/sendMessage.dto.ts), `SendListDto` e `SendButtonsDto`. A compatibilidade efetiva depende da versão e do transporte instalado. Não foi feita simulação de envio real nos testes automatizados.

## Consistência e operação

A API `/api/dsu` exige token próprio. O número é extraído do remetente da mensagem autenticada, nunca do texto digitado. LIDs só são aceitos quando a Evolution informa `remoteJidAlt` com um telefone; caso contrário o evento é ignorado.

Sessões ficam no PostgreSQL, por instância/telefone. Um bloqueio serializa mensagens do mesmo contato. Criação/conclusão, histórico, fila de notificações, estado e recibo da mensagem são gravados na mesma transação. Eventos repetidos não repetem operações nem respostas. Ações usam as mesmas funções de tarefas do sistema, com autoria do colaborador identificado.

O processamento HTTP pode ser repetido com segurança. O envio WhatsApp não tem repetição automática: se a resposta for perdida após commit, ou a Evolution falhar, a tarefa pode ter sido gravada; confira pelo sistema ou envie Menu/Minhas tarefas antes de tentar criar de novo. Não há garantia de entrega exatamente uma vez pelo provedor. Nenhum payload de entrada é persistido integralmente; o workflow evita salvar execuções, pois mensagens podem conter informações internas. Recibos de deduplicação devem ser mantidos por pelo menos 24 horas; sessões expiradas podem ser removidas pela rotina operacional de retenção.

## Trocar para a instância do Assistente

Alterar `instance` no nó Configuração e `DSU_WHATSAPP_INSTANCE` no servidor, configurar o webhook autenticado na nova instância e trocar a instância nos fluxos de avisos que devem passar a sair pelo DSU. A lógica de tarefas e os dados de usuários não precisam ser alterados. Sessões são isoladas por instância.

## Configuração recebida do n8n — webhook existente

A exportação fornecida já contém o workflow DSU com `POST /webhook/evolution`, instância `BotDemandas` e Evolution em `http://187.77.36.214:8080`. O arquivo ajustado em `.m8/Assistente RJ (DSU) — WhatsApp e tarefas.json` preserva os identificadores do workflow e das credenciais, reaproveitando **Evolution — BotDemandas** em **Receber mensagem** e **Responder WhatsApp**. A pasta `.m8` permanece fora do Git. A versão em `automations/n8n/assistente-rj-dsu.json` usa o mesmo caminho, mas não inclui identificadores privados de credenciais.

Em **Processar conversa**, a referência **Header Auth account** foi preservada: conferir `Name=Authorization` e `Value=Bearer <DSU_AUTOMATION_TOKEN>`. Não é possível verificar o segredo pelo JSON exportado. Na Evolution, enviar `apikey` como header HTTP para autenticar a entrada; a propriedade `apikey` do corpo não basta.

Importar/atualizar o workflow existente e conferir as três credenciais antes de publicar. O arquivo está marcado como inativo para revisão. Não publicar duas cópias com `POST /webhook/evolution`. A exportação enviada contém somente o ramo DSU; não contém outros consumidores para mesclar. Caso exista outro workflow com esse caminho, integrar nele os quatro nós do DSU, preservando seus ramos.

Na verificação de 08/10/2026, o endereço público `/api/dsu` retornou HTML em vez da resposta JSON da API. Confirmar a publicação do backend e o roteamento desse caminho. Sem token, o endpoint implementado deve responder HTTP 401 com JSON; não deve retornar a página do sistema.

## Workflow integrado com as demandas existentes

Arquivo de implantação: **`.m8/My workflow — DSU integrado.json`**. Origem preservada em `.m8/My workflow.json`. Para gerar novamente a partir das duas exportações privadas, executar `node scripts/n8n/merge-dsu.mjs` na raiz do repositório.

O resultado mantém o nome e identificador de **My workflow**, todos os nós antigos e suas conexões internas, e somente um webhook `POST /webhook/evolution`. A saída do webhook passa pelo roteamento DSU:

- Grupos, outras instâncias e remetentes LID sem telefone alternativo seguem o ramo anterior.
- Mensagens privadas recebidas pela BotDemandas seguem a API DSU. Mensagens enviadas pela própria BotDemandas são ignoradas para evitar respostas em ciclo.
- Fora do preenchimento de tarefa, os comandos antigos `listar`, `listar @responsável`, `concluir DM-…`, `reabrir DM-…`, `original DM-…` e menções de responsáveis retornam exclusivamente ao ramo antigo. As regras e permissões desses comandos continuam sendo as do workflow original.
- Durante título, responsável, descrição, vencimento ou confirmação, a mensagem permanece no DSU, mesmo se contiver uma menção ou coincidir com um comando antigo. Para interromper, enviar `Menu` ou `Cancelar` antes do comando antigo.
- A API informa `route=legacy`; o n8n restaura a mensagem original antes de entrar em `Edit Fields`. Não há execução simultânea dos dois ramos.

**Implantar no workflow existente:** abrir **My workflow**, guardar a exportação original e importar o arquivo integrado nesse editor, conferindo que continua sendo o workflow existente. Não publicar uma segunda cópia com `/webhook/evolution`. Manter o workflow separado “Assistente RJ (DSU)” inativo.

Antes de publicar o integrado:

1. Publicar a aplicação com o backend DSU atualizado, incluindo `legacyRouting`. A migração 045 já foi aplicada; não há nova migração nesta integração.
2. Conferir a credencial de **DSU — Processar conversa** (`Authorization: Bearer <DSU_AUTOMATION_TOKEN>`).
3. **O webhook integrado passa a exigir Header Auth da Evolution.** Antes de substituir o fluxo ativo, configurar na Evolution o header HTTP `apikey` correspondente; sem isso, tanto DSU como comandos antigos serão rejeitados com 401. Não é suficiente existir uma propriedade `apikey` no corpo do evento.
4. Confirmar a credencial de **DSU — Responder WhatsApp** e publicar somente **My workflow**.
5. Testar `Menu` no privado e uma consulta antiga autorizada, conferindo ausência de resposta duplicada. Os testes locais não enviam mensagens WhatsApp.

O arquivo integrado fica inativo para revisão. IDs de credenciais e quaisquer segredos já presentes no fluxo antigo permanecem somente na pasta privada `.m8`. O gerador não imprime seus valores. Execuções não são salvas por padrão para evitar persistir mensagens e cabeçalhos nos logs do novo fluxo.

Limitação de entrega: a decisão de encaminhar ao legado é deduplicada na API, mas a execução dos nós antigos não faz parte da transação do sistema. Se o ramo antigo falhar depois da decisão, revisar essa execução antes de tentar novamente; não há repetição automática de gravações de demandas DM.


## Ativar os menus numerados no fluxo já instalado

A criação, consulta, escolha de responsável, paginação e confirmações usam texto com `1 — opção`, `2 — opção` etc. A API persiste a correspondência entre número e ação, mantendo as permissões e deduplicação existentes.

Para testar sem esperar pela publicação da aplicação, substituir todo o JavaScript do nó **DSU — Preparar respostas** pelo conteúdo de `scripts/n8n/dsu-respostas-texto.js`. Esse adaptador aceita tanto as respostas interativas do backend anterior quanto `sendText` do backend atualizado. Não exige alterar o container Evolution novamente.

No nó **DSU — Responder WhatsApp**, restaurar os campos que possam ter sido modificados no teste dos botões:

- URL (Expression): `{{ $json.evolutionUrl + '/message/sendText/' + encodeURIComponent($json.instance) }}`
- JSON (Expression): `{{ $json.body }}`
- Credencial: Header Auth da Evolution (`apikey`).

Salvar/publicar o workflow, enviar **Menu** e responder com números. Não é preciso importar todo o fluxo nem alterar as credenciais já corrigidas. A apresentação enviada pela API do sistema passa a ser texto quando o backend for publicado. Os arquivos JSON locais também foram atualizados. Os comandos DM continuam no ramo antigo fora do preenchimento de tarefas.

### Alertas pelo WhatsApp

Na criação de uma tarefa, após o vencimento, o DSU pergunta se deseja agendar um alerta. Selecione Sim e informe `DD/MM/AAAA HH:mm`, no horário de Brasília. A confirmação cria a tarefa e o alerta na mesma transação. Também é possível acessar **Tarefas → Criar alerta**, informar o código `TAR-123`, a data e hora e confirmar o agendamento. Os alertas são únicos, sem repetição, destinados ao responsável conforme as regras existentes do sistema. O colaborador pode agendar nas próprias tarefas; administradores podem acessar outras tarefas. Tarefas concluídas e tarefas restritas sem permissão não permitem agendamento. Essa mudança requer publicar o backend atualizado; não exige trocar o adaptador de respostas do n8n.

### Preparação de listas interativas

As respostas de menu também incluem o campo `menu`, com título, descrição, texto do botão e linhas com `rowId` associado à sessão. O texto numerado continua em `body.text`, compatível com o adaptador existente. O clique deve devolver o `rowId` intacto; opções de menus anteriores são rejeitadas pela sessão. Essa estrutura permite escolher o transporte sem reconstruir as opções a partir do texto. Ainda não ativa o envio interativo: a integração de envio/recebimento e a renderização no aparelho precisam ser validadas antes da troca em produção.
