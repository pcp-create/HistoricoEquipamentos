# Vínculos de equipamentos e status no M8

Contrato verificado em 10/11/2026 no OpenAPI oficial `https://api.integra.m8sistemas.com.br/swagger/v1/swagger.json`, schemas PessoaEquipamentoListResponseDto, PessoaEquipamentoRequestDto e PessoaEquipamentoUpdateRequestDto.

- GET `/v1/estoque/equipamento/pessoa/{pessoaId}` retorna o ID do **vínculo**, equipamento, pessoa, `ativo` booleano e `motivoInativacao`.
- POST `/v1/estoque/equipamento/pessoa` recebe somente `equipamentoId` e `pessoaId`.
- PATCH `/v1/estoque/equipamento/pessoa/{id}` usa o ID do **vínculo**, não o ID do equipamento nem da pessoa. No contrato de escrita, `ativo` é BoleanoEnum: `"Nao"` para false e `"Sim"` para true. O motivo é enviado em `motivoInativacao`.

## Exibição

O payload importado é preservado integralmente, inclusive status e motivo. Um vínculo inativo continua presente no cadastro: `ativo=false` não significa exclusão. O controle exibe INATIVO e o motivo visível, inclusive junto ao cliente. Visitas usa o status específico daquele cliente. O controle geral considera inativo quando todos os vínculos conhecidos do equipamento estão inativos; se outro cliente mantém vínculo ativo, a máquina permanece ativa no geral. Status ausente em dados antigos permanece desconhecido, sem ser inventado como false.

Inativações locais ainda não confirmadas continuam visíveis. Após confirmar o envio, o M8 passa a ser a fonte do status; uma alteração posterior no ERP não é desfeita por uma intenção local antiga já confirmada. A data de coleta não é apresentada como data de inativação do ERP, que não é fornecida pela API.

## Cadastro e confirmação

Oficina, Visitas e OS mantêm o cadastro compartilhado. Depois de criar o equipamento, a intenção de vínculo é persistida e processada fora da transação de cadastro. Primeiro consulta o cliente e evita POST se o par já existe, inclusive quando está inativo. Depois do POST, somente o GET do par exato confirma a integração e conclui uma eventual tarefa antiga de vínculo. Clientes M8 não exigem mais responsável de tarefa de vínculo manual. Leads sem ID de pessoa M8 permanecem pendentes; nenhum ID é adivinhado ou enviado como zero.

A solicitação de criação do vínculo possui lease durável e marcador de envio antes do POST. Requisições concorrentes não repetem o POST. Resposta perdida ou processo interrompido depois do envio requer consulta para reconciliar: não há repetição automática de POST incerto. Uma falha no vínculo não recria o equipamento. O equipamento já confirmado no M8 permanece selecionável e o vínculo conserva o indicador de pendência.

Inativação/reativação global publica a intenção para os vínculos atuais do equipamento; uma inativação de Visitas afeta apenas o cliente selecionado. PATCHs são precedidos por GET e verificados por um novo GET. Status/motivo já iguais não geram PATCH redundante. Falhas conservam a intenção e o erro para nova conferência. Intenções antigas de Visitas são superadas por uma alteração global posterior, evitando reverter a decisão mais recente.

## Estrutura e rotina

```sh
cd web
node --env-file=.env.local --conditions=react-server --import tsx scripts/setup-equipment-relations.mts
node --env-file=.env.local --conditions=react-server --import tsx scripts/sync-equipment-relationships.mts
node --env-file=.env.local --conditions=react-server --import tsx scripts/sync-equipment-relationships.mts --apply
```

A migração 105 acrescenta metadados de confirmação, lease e erro, preservando os dados existentes. A execução sem `--apply` é somente simulação. A coleta coletiva `/pessoa/0` apenas antecipa vínculos retornados: não exclui ausentes. A fila individual documentada do integrador continua reconciliando a base. O processamento de status é idempotente e só envia o que ainda não foi confirmado. O POST exige certeza de que nenhum envio anterior ficou incerto.

## Conferência executada

Antes da rotina foram preservados os vínculos em `/home/codespace/backups/equipment-api`. O levantamento encontrou zero vínculos locais pendentes e zero inativações locais pendentes. O GET coletivo retornou 2.337 vínculos, incluindo 43 inativos; foram atualizados na base do sistema. A rotina finalizou com zero pendências elegíveis de vínculo/status. A auditoria adicional encontrou seis solicitações antigas sem ID de equipamento nas Visitas: duas com tarefa já concluída e quatro ainda abertas (TAR-1738, TAR-1751, TAR-1754 e TAR-1771). Não foram confundidas com vínculos prontos para atribuição: três têm série insuficiente e/ou cliente Lead sem ID M8; a quarta informa série 67405, não localizada no catálogo importado ou entre os vínculos atuais do cliente. Permanecem em conferência, sem criar ou atribuir uma máquina por adivinhação. Nenhum equipamento ou vínculo real foi criado e nenhum PATCH real foi necessário nesta execução. Os testes de POST/PATCH foram realizados com respostas simuladas.

A publicação do portal foi autorizada em 10/11/2026. A migração e a conferência da base configurada foram executadas antes da implantação. A atualização do processo externo do integrador deve acompanhar seu procedimento próprio de implantação; esta publicação do portal não reinicia esse serviço.

Dos 43 equipamentos com algum vínculo inativo, 31 não têm outro vínculo ativo conhecido e 12 têm vínculos mistos. O controle geral mantém os 12 ativos e identifica o vínculo inativo junto ao respectivo cliente.
